import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import { acquireAdvisoryLock } from "@/lib/stock";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  normalizeTaxCalculationMode,
  type TaxCalculationModeValue,
} from "@/lib/tax";

type Params = { params: Promise<{ id: string }> };

type QuotationLinePayload = {
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  uom?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  discountRate?: number | string | null;
  discountType?: string | null;
  locationId?: string | null;
  taxCodeId?: string | null;
  taxRate?: number | string | null;
  remarks?: string | null;
};

type TaxCodeSnapshot = {
  id: string;
  code: string;
  description: string;
  displayLabel?: string | null;
  rate: Prisma.Decimal | number | string;
  calculationMethod: "EXCLUSIVE" | "INCLUSIVE";
};

function normalizeDate(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Document Date is invalid.");
  return date;
}

function decimal(value: number | string | null | undefined, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(2));
}

function qtyDecimal(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Quantity must be greater than zero.");
  return new Prisma.Decimal(numeric.toFixed(3));
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTaxCodeId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMalaysiaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) throw new Error("Unable to generate quotation date prefix.");

  return { year, month, day };
}

function buildSalesDocumentEntityLockKey(transactionId: string) {
  return `sales-transaction:${transactionId}`;
}

function buildSalesRevisionLockKey(baseDocNo: string) {
  return `sales-revision:${baseDocNo}`;
}

function stripRevisionSuffix(docNo: string) {
  return docNo.replace(/-\d+$/, "").trim().toUpperCase();
}

async function generateRevisionDocNo(tx: Prisma.TransactionClient, originalDocNo: string) {
  const baseDocNo = stripRevisionSuffix(originalDocNo);
  const existing = await tx.salesTransaction.findMany({
    where: { docNo: { startsWith: `${baseDocNo}-` } },
    select: { docNo: true },
  });

  let maxRevision = 0;
  const pattern = new RegExp(`^${baseDocNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  for (const row of existing) {
    const match = row.docNo?.match(pattern);
    if (!match) continue;
    const revisionNo = Number(match[1]);
    if (Number.isFinite(revisionNo) && revisionNo > maxRevision) maxRevision = revisionNo;
  }

  return `${baseDocNo}-${maxRevision + 1}`;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function taxSnapshot(taxCode: TaxCodeSnapshot | null) {
  if (!taxCode) {
    return {
      taxCodeId: null,
      taxCode: null,
      taxDescription: null,
      taxDisplayLabel: null,
      taxRate: new Prisma.Decimal(0),
      taxCalculationMethod: null,
    };
  }

  return {
    taxCodeId: taxCode.id,
    taxCode: taxCode.code,
    taxDescription: taxCode.description,
    taxDisplayLabel: taxCode.displayLabel || null,
    taxRate: decimal(toNumber(taxCode.rate), 0),
    taxCalculationMethod: taxCode.calculationMethod,
  };
}

function calculateLine(
  line: QuotationLinePayload,
  lineNo: number,
  productMap: Map<string, any>,
  locationMap: Map<string, { id: string; code: string; name: string }>,
  taxCodeMap: Map<string, TaxCodeSnapshot>,
  options: {
    taxModuleEnabled: boolean;
    taxCalculationMode: TaxCalculationModeValue;
  }
) {
  const inventoryProductId = typeof line.inventoryProductId === "string" && line.inventoryProductId.trim() ? line.inventoryProductId.trim() : null;
  const product = inventoryProductId ? productMap.get(inventoryProductId) : null;
  const locationId = typeof line.locationId === "string" && line.locationId.trim() ? line.locationId.trim() : null;
  const location = locationId ? locationMap.get(locationId) || null : null;

  const productCode = normalizeText(line.productCode) || product?.code || "";
  const productDescription = normalizeText(line.productDescription) || product?.description || "";
  const uom = (normalizeText(line.uom) || product?.baseUom || "UNIT").toUpperCase();

  if (!productCode || !productDescription) throw new Error(`Product line ${lineNo} is missing product information.`);

  const qty = qtyDecimal(line.qty);
  const unitPrice = decimal(line.unitPrice, product ? Number(product.sellingPrice ?? 0) : 0);
  const rawDiscountValue = decimal(line.discountRate, 0);
  const discountType = String(line.discountType || "PERCENT").toUpperCase() === "AMOUNT" ? "AMOUNT" : "PERCENT";
  const discountRate = discountType === "PERCENT" ? rawDiscountValue : new Prisma.Decimal(0);
  const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
  const discountAmount = discountType === "AMOUNT"
    ? Prisma.Decimal.min(rawDiscountValue, lineSubtotal).toDecimalPlaces(2)
    : lineSubtotal.mul(rawDiscountValue).div(100).toDecimalPlaces(2);
  const taxableAmount = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

  const lineTaxCode =
    options.taxModuleEnabled && options.taxCalculationMode === "LINE_ITEM"
      ? taxCodeMap.get(normalizeTaxCodeId(line.taxCodeId) || "") || null
      : null;

  const lineTaxBreakdown = calculateLineItemTaxBreakdown({
    lineTotal: Number(taxableAmount),
    taxRate: lineTaxCode ? toNumber(lineTaxCode.rate) : null,
    calculationMethod: lineTaxCode?.calculationMethod ?? null,
    taxEnabled: Boolean(lineTaxCode),
  });

  return {
    lineNo,
    inventoryProductId,
    productCode,
    productDescription,
    uom,
    qty,
    unitPrice,
    discountRate,
    discountType,
    discountAmount,
    locationId: location?.id || null,
    locationCode: location?.code || null,
    locationName: location?.name || null,
    ...taxSnapshot(lineTaxCode),
    taxAmount: decimal(lineTaxBreakdown.taxAmount, 0),
    lineSubtotal,
    lineTotal: decimal(lineTaxBreakdown.lineGrandTotalAfterTax, Number(taxableAmount)),
    remarks: normalizeText(line.remarks),
  };
}

async function hasActiveDownstreamTransaction(tx: Prisma.TransactionClient, transactionId: string) {
  const activeLink = await tx.salesTransactionLink.findFirst({
    where: {
      sourceTransactionId: transactionId,
      targetTransaction: { status: { not: "CANCELLED" } },
    },
    select: { id: true },
  });

  return Boolean(activeLink);
}

async function buildQuotationData(body: any) {
  const docDate = normalizeDate(body.docDate);
  const customerId = normalizeText(body.customerId);
  if (!customerId) throw new Error("Customer is required.");

  const rawLines = Array.isArray(body.lines) ? (body.lines as QuotationLinePayload[]) : [];
  if (rawLines.length === 0) throw new Error("Please add at least one product line.");

  const [customer, config, taxConfig, activeTaxCodes] = await Promise.all([
    db.user.findFirst({
      where: { id: customerId, role: "CUSTOMER" },
      include: { agent: true },
    }),
    db.stockConfiguration.findUnique({ where: { id: "default" } }),
    db.taxConfiguration.findUnique({ where: { id: "default" } }),
    db.taxCode.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        description: true,
        displayLabel: true,
        rate: true,
        calculationMethod: true,
      },
    }),
  ]);

  if (!customer) throw new Error("Selected customer is invalid.");

  const taxModuleEnabled = Boolean(taxConfig?.taxModuleEnabled);
  const taxCalculationMode = normalizeTaxCalculationMode(taxConfig?.taxCalculationMode);
  const taxCodeMap = new Map<string, TaxCodeSnapshot>(activeTaxCodes.map((item) => [item.id, item as TaxCodeSnapshot]));

  const productIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.inventoryProductId)).filter(Boolean))) as string[];
  const locationIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.locationId)).filter(Boolean))) as string[];
  const [products, locations] = await Promise.all([
    productIds.length
      ? db.inventoryProduct.findMany({
          where: { id: { in: productIds }, isActive: true },
          select: { id: true, code: true, description: true, baseUom: true, sellingPrice: true },
        })
      : Promise.resolve([]),
    locationIds.length
      ? db.stockLocation.findMany({
          where: { id: { in: locationIds }, isActive: true },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const productMap = new Map<string, any>(products.map((item: any) => [item.id, item]));
  const locationMap = new Map<string, { id: string; code: string; name: string }>(locations.map((item: any) => [item.id, item]));

  const normalizedLines = rawLines.map((line, index) =>
    calculateLine(line, index + 1, productMap, locationMap, taxCodeMap, {
      taxModuleEnabled,
      taxCalculationMode,
    })
  );

  const subtotal = normalizedLines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = normalizedLines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);

  const transactionTaxCode =
    taxModuleEnabled && taxCalculationMode === "TRANSACTION"
      ? taxCodeMap.get(normalizeTaxCodeId(body.transactionTaxCodeId) || "") || null
      : null;

  const transactionTaxBreakdown = calculateTaxBreakdown({
    subtotal: Number(subtotal),
    discount: Number(discountTotal),
    taxRate: transactionTaxCode ? toNumber(transactionTaxCode.rate) : null,
    calculationMethod: transactionTaxCode?.calculationMethod ?? null,
    taxEnabled: Boolean(transactionTaxCode),
  });

  const lineItemTaxTotal = normalizedLines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const lineItemGrandTotal = normalizedLines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

  const taxTotal =
    taxModuleEnabled && taxCalculationMode === "LINE_ITEM"
      ? lineItemTaxTotal
      : decimal(transactionTaxBreakdown.taxAmount, 0);

  const grandTotal =
    taxModuleEnabled && taxCalculationMode === "LINE_ITEM"
      ? lineItemGrandTotal
      : decimal(transactionTaxBreakdown.grandTotalAfterTax, Number(subtotal.minus(discountTotal)));

  const projectFeatureEnabled = Boolean(config?.enableProject);
  const departmentFeatureEnabled = projectFeatureEnabled && Boolean(config?.enableDepartment);
  const projectId = projectFeatureEnabled ? normalizeText(body.projectId) : null;
  const departmentId = departmentFeatureEnabled ? normalizeText(body.departmentId) : null;
  const transactionTaxSnapshot = taxSnapshot(transactionTaxCode);

  return {
    customer,
    docDate,
    normalizedLines,
    taxCalculationMode,
    taxTotal,
    grandTotal,
    data: {
      docDate,
      docDesc: normalizeText(body.docDesc),
      customerId: customer.id,
      customerAccountNo: customer.customerAccountNo,
      customerName: customer.name,
      billingAddressLine1: normalizeText(body.billingAddressLine1) ?? customer.billingAddressLine1,
      billingAddressLine2: normalizeText(body.billingAddressLine2) ?? customer.billingAddressLine2,
      billingAddressLine3: normalizeText(body.billingAddressLine3) ?? customer.billingAddressLine3,
      billingAddressLine4: normalizeText(body.billingAddressLine4) ?? customer.billingAddressLine4,
      billingCity: normalizeText(body.billingCity) ?? customer.billingCity,
      billingPostCode: normalizeText(body.billingPostCode) ?? customer.billingPostCode,
      billingCountryCode: normalizeText(body.billingCountryCode) ?? customer.billingCountryCode,
      deliveryAddressLine1: normalizeText(body.deliveryAddressLine1) ?? customer.deliveryAddressLine1,
      deliveryAddressLine2: normalizeText(body.deliveryAddressLine2) ?? customer.deliveryAddressLine2,
      deliveryAddressLine3: normalizeText(body.deliveryAddressLine3) ?? customer.deliveryAddressLine3,
      deliveryAddressLine4: normalizeText(body.deliveryAddressLine4) ?? customer.deliveryAddressLine4,
      deliveryCity: normalizeText(body.deliveryCity) ?? customer.deliveryCity,
      deliveryPostCode: normalizeText(body.deliveryPostCode) ?? customer.deliveryPostCode,
      deliveryCountryCode: normalizeText(body.deliveryCountryCode) ?? customer.deliveryCountryCode,
      attention: normalizeText(body.attention) ?? customer.attention,
      contactNo: normalizeText(body.contactNo) ?? customer.phone,
      email: normalizeText(body.email) ?? customer.email,
      currency: normalizeText(body.currency) ?? customer.currency ?? "MYR",
      reference: normalizeText(body.reference),
      remarks: normalizeText(body.remarks),
      agentId: normalizeText(body.agentId) ?? customer.agentId,
      projectId,
      departmentId,
      subtotal,
      discountTotal,
      taxTotal,
      taxableSubtotal: decimal(transactionTaxBreakdown.taxableSubtotal, Number(subtotal.minus(discountTotal))),
      grandTotal,
      isTaxEnabledSnapshot: taxModuleEnabled,
      taxCalculationModeSnapshot: taxCalculationMode,
      ...transactionTaxSnapshot,
      termsAndConditions: normalizeText(body.termsAndConditions),
      bankAccount: normalizeText(body.bankAccount),
      footerRemarks: normalizeText(body.footerRemarks),
    },
  };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "cancel") {
      const reason = typeof body.cancelReason === "string" && body.cancelReason.trim() ? body.cancelReason.trim() : "Cancelled by admin.";

      const transaction = await db.salesTransaction.findUnique({ where: { id }, select: { id: true, docNo: true, status: true, docType: true } });
      if (!transaction || transaction.docType !== "QO") {
        return NextResponse.json({ ok: false, error: "Quotation not found." }, { status: 404 });
      }
      if (transaction.status === "CANCELLED") {
        return NextResponse.json({ ok: false, error: "Quotation is already cancelled." }, { status: 400 });
      }

      const updated = await db.salesTransaction.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledByAdminId: admin.id,
          cancelReason: reason,
          cancelledAt: new Date(),
        },
      });

      await createAuditLogFromRequest({
        req,
        user: admin,
        module: "Sales Quotation",
        action: "CANCEL",
        entityType: "SalesTransaction",
        entityId: updated.id,
        entityCode: updated.docNo,
        description: `${admin.name} cancelled quotation ${updated.docNo}.`,
        newValues: { cancelReason: reason },
        status: "SUCCESS",
      }).catch(() => null);

      return NextResponse.json({ ok: true, transaction: updated });
    }

    if (action !== "edit" && action !== "revise") {
      return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
    }

    const prepared = await buildQuotationData(body);

    const saved = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, buildSalesDocumentEntityLockKey(id));

      const existing = await tx.salesTransaction.findUnique({
        where: { id },
        include: { revisedFrom: { select: { id: true, docNo: true } } },
      });

      if (!existing || existing.docType !== "QO") throw new Error("Quotation not found.");
      if (existing.status === "CANCELLED") throw new Error("Cancelled quotation cannot be edited or revised.");
      if (await hasActiveDownstreamTransaction(tx, existing.id)) {
        throw new Error("This quotation has active downstream sales transactions and cannot be edited or revised.");
      }

      if (action === "edit") {
        await tx.salesTransactionLine.deleteMany({ where: { transactionId: existing.id } });
        return tx.salesTransaction.update({
          where: { id: existing.id },
          data: {
            ...prepared.data,
            lines: { create: prepared.normalizedLines },
          },
        });
      }

      const rootId = existing.revisedFromId || existing.id;
      const rootDocNo = existing.revisedFrom?.docNo || existing.docNo;
      const baseDocNo = stripRevisionSuffix(rootDocNo);
      await acquireAdvisoryLock(tx, buildSalesRevisionLockKey(baseDocNo));
      const newDocNo = await generateRevisionDocNo(tx, rootDocNo);

      const updatedOriginal = await tx.salesTransaction.update({
        where: { id: existing.id },
        data: {
          status: "CANCELLED",
          cancelledByAdminId: admin.id,
          cancelReason: `Revised to ${newDocNo}`,
          cancelledAt: new Date(),
        },
      });

      const createdRevision = await tx.salesTransaction.create({
        data: {
          docType: "QO",
          docNo: newDocNo,
          status: "PENDING",
          revisedFromId: rootId,
          createdByAdminId: admin.id,
          ...prepared.data,
          lines: { create: prepared.normalizedLines },
        },
      });

      await tx.salesTransactionLink.create({
        data: {
          sourceTransactionId: updatedOriginal.id,
          targetTransactionId: createdRevision.id,
          linkType: "GENERATED_TO",
        },
      }).catch(() => null);

      return createdRevision;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Sales Quotation",
      action: action === "revise" ? "REVISE" : "EDIT",
      entityType: "SalesTransaction",
      entityId: saved.id,
      entityCode: saved.docNo,
      description: action === "revise" ? `${admin.name} revised quotation ${saved.docNo}.` : `${admin.name} edited quotation ${saved.docNo}.`,
      newValues: {
        docNo: saved.docNo,
        customerId: prepared.customer.id,
        customerName: prepared.customer.name,
        lineCount: prepared.normalizedLines.length,
        taxCalculationMode: prepared.taxCalculationMode,
        taxTotal: prepared.taxTotal.toString(),
        grandTotal: prepared.grandTotal.toString(),
      },
      status: "SUCCESS",
    }).catch(() => null);

    return NextResponse.json({ ok: true, transaction: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update quotation." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
