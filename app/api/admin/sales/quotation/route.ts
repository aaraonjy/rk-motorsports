import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
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

function assertValidManualDocNo(value: unknown) {
  const docNo = normalizeText(value)?.toUpperCase() || null;
  if (!docNo) return null;
  if (!/^QO-\d{8}-\d{4}$/.test(docNo)) {
    throw new Error("Quotation No must use QO-YYYYMMDD-0001 format.");
  }
  return docNo;
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

function buildSalesDocumentNumberLockKey(docType: string, documentDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(documentDate);
  return `sales-docno:${docType}:${year}${month}${day}`;
}

async function generateQuotationNo(tx: Prisma.TransactionClient, docDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(docDate);
  const prefix = `QO-${year}${month}${day}`;
  const baseDocNoPattern = new RegExp(`^${prefix}-(\\d{4})$`);

  const existing = await tx.salesTransaction.findMany({
    where: { docType: "QO", docNo: { startsWith: `${prefix}-` } },
    select: { docNo: true },
  });

  let maxSeq = 0;
  for (const item of existing) {
    const match = item.docNo?.match(baseDocNoPattern);
    if (!match) continue;

    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
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

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("nextDocNo") === "1") {
      const docDate = normalizeDate(searchParams.get("docDate"));
      const docNo = await db.$transaction(async (tx) => {
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("QO", docDate));
        return generateQuotationNo(tx, docDate);
      });

      return NextResponse.json({ ok: true, docNo });
    }

    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";

    const rows = await db.salesTransaction.findMany({
      where: {
        docType: "QO",
        ...(status !== "ALL" ? { status: status as SalesTransactionStatus } : {}),
        ...(q
          ? {
              OR: [
                { docNo: { contains: q, mode: "insensitive" } },
                { customerName: { contains: q, mode: "insensitive" } },
                { customerAccountNo: { contains: q, mode: "insensitive" } },
                { reference: { contains: q, mode: "insensitive" } },
                { docDesc: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ docNo: "desc" }],
      take: 100,
      include: {
        customer: { select: { id: true, name: true, email: true, customerAccountNo: true } },
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        revisedFrom: { select: { id: true, docNo: true } },
        revisions: { select: { id: true, docNo: true, status: true } },
        targetLinks: {
          include: {
            targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
          },
        },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    return NextResponse.json({ ok: true, transactions: rows });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load quotations." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const docDate = normalizeDate(body.docDate);
    const requestedDocNo = assertValidManualDocNo(body.docNo);
    const customerId = normalizeText(body.customerId);
    if (!customerId) return NextResponse.json({ ok: false, error: "Customer is required." }, { status: 400 });

    const rawLines = Array.isArray(body.lines) ? (body.lines as QuotationLinePayload[]) : [];
    if (rawLines.length === 0) return NextResponse.json({ ok: false, error: "Please add at least one product line." }, { status: 400 });

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

    if (!customer) return NextResponse.json({ ok: false, error: "Selected customer is invalid." }, { status: 400 });

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

    const created = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("QO", docDate));
      let docNo = requestedDocNo || (await generateQuotationNo(tx, docDate));

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = await tx.salesTransaction.findUnique({ where: { docNo }, select: { id: true } });
        if (!existing) break;
        if (requestedDocNo) throw new Error("Quotation No already exists.");
        docNo = await generateQuotationNo(tx, docDate);
      }

      const existing = await tx.salesTransaction.findUnique({ where: { docNo }, select: { id: true } });
      if (existing) throw new Error("Quotation No already exists.");

      return tx.salesTransaction.create({
        data: {
          docType: "QO",
          docNo,
          docDate,
          docDesc: normalizeText(body.docDesc),
          status: "PENDING",
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
          createdByAdminId: admin.id,
          lines: { create: normalizedLines },
        },
      });
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Sales Quotation",
      action: "CREATE",
      entityType: "SalesTransaction",
      entityId: created.id,
      entityCode: created.docNo,
      description: `${admin.name} created quotation ${created.docNo}.`,
      newValues: {
        docType: "QO",
        docNo: created.docNo,
        customerId: customer.id,
        customerName: customer.name,
        lineCount: normalizedLines.length,
        taxCalculationMode,
        taxTotal: taxTotal.toString(),
        grandTotal: grandTotal.toString(),
      },
      status: "SUCCESS",
    }).catch(() => null);

    return NextResponse.json({ ok: true, transaction: created });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create quotation." },
      { status: 400 }
    );
  }
}
