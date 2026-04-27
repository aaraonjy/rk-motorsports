import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireAdvisoryLock,
  acquireStockMutationLocks,
  buildDocumentNumberLockKey,
  buildLedgerValues,
  buildStockBalanceLockKey,
  buildTransactionNumberLockKey,
  createStoredQtyDecimal,
  generateStockDocumentNumber,
  generateStockTransactionNumber,
  getStockBalance,
} from "@/lib/stock";

type DeliveryOrderLinePayload = {
  sourceLineId?: string | null;
  sourceTransactionId?: string | null;
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
  remarks?: string | null;
};

function normalizeDate(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Document Date is invalid.");
  return date;
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
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

  if (!year || !month || !day) throw new Error("Unable to generate delivery order date prefix.");
  return { year, month, day };
}

function buildSalesDocumentNumberLockKey(docType: string, documentDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(documentDate);
  return `sales-docno:${docType}:${year}${month}${day}`;
}

async function generateDeliveryOrderNo(tx: Prisma.TransactionClient, docDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(docDate);
  const prefix = `DO-${year}${month}${day}`;
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`);

  const existing = await tx.salesTransaction.findMany({
    where: { docType: "DO", docNo: { startsWith: `${prefix}-` } },
    select: { docNo: true },
  });

  let maxSeq = 0;
  for (const item of existing) {
    const match = item.docNo?.match(pattern);
    if (!match) continue;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
}

function assertValidManualDocNo(value: unknown) {
  const docNo = normalizeText(value)?.toUpperCase() || null;
  if (!docNo) return null;
  if (!/^DO-\d{8}-\d{4}$/.test(docNo)) {
    throw new Error("Delivery Order No must use DO-YYYYMMDD-0001 format.");
  }
  return docNo;
}

function sumLinkedQty(
  line: {
    sourceLineLinks?: Array<{ linkType?: string | null; qty?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
  },
  linkType: "DELIVERED_TO" | "INVOICED_TO"
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}

function withSalesLineProgress(line: any) {
  const orderedQty = toNumber(line.qty);
  const deliveredQty = sumLinkedQty(line, "DELIVERED_TO");
  const invoicedQty = sumLinkedQty(line, "INVOICED_TO");

  return {
    ...line,
    orderedQty,
    deliveredQty,
    invoicedQty,
    remainingDeliveryQty: Math.max(0, orderedQty - deliveredQty),
    remainingInvoiceQty: Math.max(0, orderedQty - invoicedQty),
  };
}

function calculateSalesOrderStatus(lines: Array<{ orderedQty: number; deliveredQty: number; invoicedQty: number }>) {
  if (lines.length === 0) return "OPEN" as SalesTransactionStatus;

  const hasAnyProgress = lines.some((line) => line.deliveredQty > 0 || line.invoicedQty > 0);
  const isFullyDelivered = lines.every((line) => line.deliveredQty >= line.orderedQty);
  const isFullyInvoiced = lines.every((line) => line.invoicedQty >= line.orderedQty);

  if (isFullyDelivered || isFullyInvoiced) return "COMPLETED" as SalesTransactionStatus;
  if (hasAnyProgress) return "PARTIAL" as SalesTransactionStatus;
  return "OPEN" as SalesTransactionStatus;
}

async function refreshSalesOrderStatuses(tx: Prisma.TransactionClient, sourceTransactionIds: string[]) {
  const uniqueIds = Array.from(new Set(sourceTransactionIds.filter(Boolean)));
  for (const sourceTransactionId of uniqueIds) {
    const source = await tx.salesTransaction.findUnique({
      where: { id: sourceTransactionId },
      select: {
        id: true,
        docType: true,
        status: true,
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            sourceLineLinks: {
              include: {
                targetTransaction: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });

    if (!source || source.docType !== "SO" || source.status === "CANCELLED") continue;

    const lines = source.lines.map((line) => withSalesLineProgress(line));
    const nextStatus = calculateSalesOrderStatus(lines);
    if (source.status !== nextStatus) {
      await tx.salesTransaction.update({
        where: { id: source.id },
        data: { status: nextStatus },
      });
    }
  }
}

async function getTrackedSourceLines(tx: Prisma.TransactionClient, sourceLineIds: string[]) {
  if (sourceLineIds.length === 0) return new Map<string, any>();

  const sourceLines = await tx.salesTransactionLine.findMany({
    where: { id: { in: sourceLineIds } },
    include: {
      transaction: { select: { id: true, docType: true, docNo: true, status: true, customerId: true } },
      sourceLineLinks: {
        include: {
          targetTransaction: { select: { id: true, status: true } },
        },
      },
    },
  });

  return new Map(sourceLines.map((line) => [line.id, withSalesLineProgress(line)]));
}

function buildDeliveryLine(
  line: DeliveryOrderLinePayload,
  lineNo: number,
  productMap: Map<string, any>,
  locationMap: Map<string, any>,
  sourceLineMap: Map<string, any>
) {
  const sourceLineId = normalizeText(line.sourceLineId);
  const sourceLine = sourceLineId ? sourceLineMap.get(sourceLineId) : null;
  const inventoryProductId = normalizeText(line.inventoryProductId) || sourceLine?.inventoryProductId || null;
  const product = inventoryProductId ? productMap.get(inventoryProductId) : null;
  const locationId = normalizeText(line.locationId) || sourceLine?.locationId || null;
  const location = locationId ? locationMap.get(locationId) : null;

  const productCode = normalizeText(line.productCode) || sourceLine?.productCode || product?.code || "";
  const productDescription = normalizeText(line.productDescription) || sourceLine?.productDescription || product?.description || "";
  const uom = (normalizeText(line.uom) || sourceLine?.uom || product?.baseUom || "UNIT").toUpperCase();
  const qty = qtyDecimal(line.qty);
  const unitPrice = decimal(line.unitPrice, sourceLine ? toNumber(sourceLine.unitPrice) : product ? Number(product.sellingPrice ?? 0) : 0);
  const discountType = String(line.discountType || sourceLine?.discountType || "PERCENT").toUpperCase() === "AMOUNT" ? "AMOUNT" : "PERCENT";
  const discountRate = discountType === "PERCENT" ? decimal(line.discountRate, sourceLine ? toNumber(sourceLine.discountRate) : 0) : new Prisma.Decimal(0);
  const rawDiscountValue = decimal(line.discountRate, sourceLine ? toNumber(sourceLine.discountRate) : 0);
  const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
  const discountAmount = discountType === "AMOUNT"
    ? Prisma.Decimal.min(rawDiscountValue, lineSubtotal).toDecimalPlaces(2)
    : lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
  const taxableAmount = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

  if (!productCode || !productDescription) throw new Error(`Product line ${lineNo} is missing product information.`);
  if (!locationId || !location) throw new Error(`Product line ${lineNo} requires a valid stock location.`);

  if (sourceLine) {
    if (sourceLine.transaction?.docType !== "SO") throw new Error("Delivery Order can only generate from Sales Order.");
    if (sourceLine.transaction?.status === "CANCELLED") throw new Error(`${sourceLine.transaction?.docNo || "Source Sales Order"} is cancelled.`);
    const remaining = Number(sourceLine.remainingDeliveryQty || 0);
    if (toNumber(qty) > remaining) {
      throw new Error(`${productCode} delivery qty exceeds remaining Sales Order qty.`);
    }
  }

  return {
    lineNo,
    sourceLineId,
    sourceTransactionId: sourceLine?.transactionId || normalizeText(line.sourceTransactionId),
    inventoryProductId,
    productCode,
    productDescription,
    uom,
    qty,
    unitPrice,
    discountRate,
    discountType,
    discountAmount,
    locationId: location.id,
    locationCode: location.code,
    locationName: location.name,
    taxCodeId: null,
    taxCode: null,
    taxDescription: null,
    taxDisplayLabel: null,
    taxRate: new Prisma.Decimal(0),
    taxCalculationMethod: null,
    taxAmount: new Prisma.Decimal(0),
    lineSubtotal,
    lineTotal: taxableAmount,
    remarks: normalizeText(line.remarks),
  };
}

async function buildDeliveryOrderData(body: any, tx: Prisma.TransactionClient) {
  const docDate = normalizeDate(body.docDate);
  const customerId = normalizeText(body.customerId);
  if (!customerId) throw new Error("Customer is required.");

  const rawLines = Array.isArray(body.lines) ? (body.lines as DeliveryOrderLinePayload[]) : [];
  if (rawLines.length === 0) throw new Error("Please add at least one product line.");

  const customer = await tx.user.findFirst({
    where: { id: customerId, role: "CUSTOMER" },
    include: { agent: true },
  });
  if (!customer) throw new Error("Selected customer is invalid.");

  const productIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.inventoryProductId)).filter(Boolean))) as string[];
  const locationIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.locationId)).filter(Boolean))) as string[];
  const sourceLineIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.sourceLineId)).filter(Boolean))) as string[];

  const [products, locations, sourceLineMap] = await Promise.all([
    productIds.length
      ? tx.inventoryProduct.findMany({
          where: { id: { in: productIds }, isActive: true },
          select: {
            id: true,
            code: true,
            description: true,
            baseUom: true,
            sellingPrice: true,
            trackInventory: true,
            batchTracking: true,
            serialNumberTracking: true,
          },
        })
      : Promise.resolve([]),
    locationIds.length
      ? tx.stockLocation.findMany({
          where: { id: { in: locationIds }, isActive: true },
          select: { id: true, code: true, name: true, isActive: true },
        })
      : Promise.resolve([]),
    getTrackedSourceLines(tx, sourceLineIds),
  ]);

  const productMap = new Map<string, any>(products.map((item: any) => [item.id, item]));
  const locationMap = new Map<string, any>(locations.map((item: any) => [item.id, item]));

  const lines = rawLines.map((line, index) => buildDeliveryLine(line, index + 1, productMap, locationMap, sourceLineMap));

  for (const line of lines) {
    const product = line.inventoryProductId ? productMap.get(line.inventoryProductId) : null;
    if (!product || !product.trackInventory) {
      throw new Error(`${line.productCode} is not a tracked stock item and cannot be delivered through DO stock out.`);
    }
    if (product.serialNumberTracking || product.batchTracking) {
      throw new Error(`${line.productCode} uses serial/batch tracking. Delivery Order serial/batch picking will be added in a later phase.`);
    }
  }

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxableSubtotal = subtotal.minus(discountTotal).toDecimalPlaces(2);
  const taxTotal = new Prisma.Decimal(0);
  const grandTotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

  const generatedFromDocNos = Array.from(new Set(Array.from(sourceLineMap.values()).map((line: any) => line.transaction?.docNo).filter(Boolean)));

  return {
    docDate,
    requestedDocNo: assertValidManualDocNo(body.docNo),
    docDesc: normalizeText(body.docDesc) || (generatedFromDocNos.length ? `Generated from ${generatedFromDocNos.join(", ")}` : null),
    customer,
    currency: normalizeText(body.currency) || customer.currency || "MYR",
    reference: normalizeText(body.reference) || generatedFromDocNos.join(", ") || null,
    remarks: normalizeText(body.remarks),
    projectId: normalizeText(body.projectId),
    departmentId: normalizeText(body.departmentId),
    termsAndConditions: normalizeText(body.termsAndConditions),
    bankAccount: normalizeText(body.bankAccount),
    footerRemarks: normalizeText(body.footerRemarks),
    subtotal,
    discountTotal,
    taxableSubtotal,
    taxTotal,
    grandTotal,
    lines,
    sourceTransactionIds: Array.from(new Set(lines.map((line) => line.sourceTransactionId).filter(Boolean))) as string[],
  };
}

async function createStockIssueForDeliveryOrder(
  tx: Prisma.TransactionClient,
  adminId: string,
  deliveryOrder: any,
  lines: Array<any>,
  body: any
) {
  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireAdvisoryLock(tx, buildTransactionNumberLockKey("SI", deliveryOrder.docDate));
  await acquireAdvisoryLock(tx, buildDocumentNumberLockKey("SI", deliveryOrder.docDate));
  await acquireStockMutationLocks(
    tx,
    lines.map((line) => ({
      inventoryProductId: line.inventoryProductId!,
      locationId: line.locationId,
    }))
  );

  for (const line of lines) {
    const balance = await getStockBalance(tx, line.inventoryProductId!, line.locationId);
    const requiredQty = toNumber(line.qty);
    if (balance < requiredQty && !config.allowNegativeStock) {
      throw new Error(`Insufficient stock for ${line.productCode}. Current balance: ${balance}. Required: ${requiredQty}.`);
    }
  }

  const transactionNo = await generateStockTransactionNumber(tx, "SI", deliveryOrder.docDate);
  const stockDocNo = await generateStockDocumentNumber(tx, "SI", deliveryOrder.docDate);

  const stockTransaction = await tx.stockTransaction.create({
    data: {
      transactionNo,
      docNo: stockDocNo,
      docDate: deliveryOrder.docDate,
      docDesc: `Auto stock issue for ${deliveryOrder.docNo}`,
      transactionType: "SI",
      transactionDate: deliveryOrder.docDate,
      reference: deliveryOrder.docNo,
      remarks: normalizeText(body.stockRemarks) || deliveryOrder.remarks || `Auto generated from Delivery Order ${deliveryOrder.docNo}`,
      projectId: deliveryOrder.projectId,
      departmentId: deliveryOrder.departmentId,
      createdByAdminId: adminId,
      lines: {
        create: lines.map((line) => ({
          inventoryProductId: line.inventoryProductId!,
          qty: line.qty,
          locationId: line.locationId,
          remarks: line.remarks || `Auto stock issue for ${deliveryOrder.docNo}`,
        })),
      },
    },
    include: { lines: true },
  });

  for (const stockLine of stockTransaction.lines) {
    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(stockLine.qty), "OUT");
    await tx.stockLedger.create({
      data: {
        movementDate: deliveryOrder.docDate,
        movementType: "SI",
        movementDirection: "OUT",
        ...ledgerValues,
        batchNo: stockLine.batchNo,
        inventoryProductId: stockLine.inventoryProductId,
        locationId: stockLine.locationId!,
        transactionId: stockTransaction.id,
        transactionLineId: stockLine.id,
        referenceNo: stockTransaction.transactionNo,
        referenceText: `Delivery Order ${deliveryOrder.docNo}`,
        sourceType: "SALES_DELIVERY_ORDER",
        sourceId: deliveryOrder.id,
        remarks: stockLine.remarks,
      },
    });
  }

  return stockTransaction;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("nextDocNo") === "1") {
      const docDate = normalizeDate(searchParams.get("docDate"));
      const docNo = await db.$transaction(async (tx) => {
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("DO", docDate));
        return generateDeliveryOrderNo(tx, docDate);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";

    const rows = await db.salesTransaction.findMany({
      where: {
        docType: "DO",
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
        sourceLinks: {
          include: {
            targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
          },
        },
        targetLinks: {
          include: {
            sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
          },
        },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    const transactions = rows.map((row) => ({
      ...row,
      sourceLinks: row.targetLinks.map((link) => ({
        sourceTransaction: link.sourceTransaction,
      })),
    }));

    return NextResponse.json({ ok: true, transactions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load delivery orders." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const created = await db.$transaction(async (tx) => {
      const data = await buildDeliveryOrderData(body, tx);

      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("DO", data.docDate));
      for (const sourceTransactionId of data.sourceTransactionIds) {
        await acquireAdvisoryLock(tx, `sales-transaction:${sourceTransactionId}`);
      }

      const docNo = data.requestedDocNo || await generateDeliveryOrderNo(tx, data.docDate);
      const duplicate = await tx.salesTransaction.findUnique({ where: { docNo }, select: { id: true } });
      if (duplicate) throw new Error("Document No already exists. Please save again so the system can generate the next available number.");

      const deliveryOrder = await tx.salesTransaction.create({
        data: {
          docType: "DO",
          docNo,
          docDate: data.docDate,
          docDesc: data.docDesc,
          status: "OPEN",
          customerId: data.customer.id,
          customerAccountNo: data.customer.customerAccountNo,
          customerName: data.customer.name,
          billingAddressLine1: data.customer.billingAddressLine1,
          billingAddressLine2: data.customer.billingAddressLine2,
          billingAddressLine3: data.customer.billingAddressLine3,
          billingAddressLine4: data.customer.billingAddressLine4,
          billingCity: data.customer.billingCity,
          billingPostCode: data.customer.billingPostCode,
          billingCountryCode: data.customer.billingCountryCode,
          deliveryAddressLine1: normalizeText(body.deliveryAddressLine1) ?? data.customer.deliveryAddressLine1,
          deliveryAddressLine2: normalizeText(body.deliveryAddressLine2) ?? data.customer.deliveryAddressLine2,
          deliveryAddressLine3: normalizeText(body.deliveryAddressLine3) ?? data.customer.deliveryAddressLine3,
          deliveryAddressLine4: normalizeText(body.deliveryAddressLine4) ?? data.customer.deliveryAddressLine4,
          deliveryCity: normalizeText(body.deliveryCity) ?? data.customer.deliveryCity,
          deliveryPostCode: normalizeText(body.deliveryPostCode) ?? data.customer.deliveryPostCode,
          deliveryCountryCode: normalizeText(body.deliveryCountryCode) ?? data.customer.deliveryCountryCode,
          attention: data.customer.attention,
          contactNo: data.customer.phone,
          email: data.customer.email,
          currency: data.currency,
          reference: data.reference,
          remarks: data.remarks,
          agentId: data.customer.agentId,
          projectId: data.projectId,
          departmentId: data.departmentId,
          subtotal: data.subtotal,
          discountTotal: data.discountTotal,
          taxableSubtotal: data.taxableSubtotal,
          taxTotal: data.taxTotal,
          grandTotal: data.grandTotal,
          termsAndConditions: data.termsAndConditions,
          bankAccount: data.bankAccount,
          footerRemarks: data.footerRemarks,
          createdByAdminId: admin.id,
          lines: {
            create: data.lines.map((line) => ({
              lineNo: line.lineNo,
              inventoryProductId: line.inventoryProductId,
              productCode: line.productCode,
              productDescription: line.productDescription,
              uom: line.uom,
              qty: line.qty,
              unitPrice: line.unitPrice,
              discountRate: line.discountRate,
              discountType: line.discountType,
              discountAmount: line.discountAmount,
              locationId: line.locationId,
              locationCode: line.locationCode,
              locationName: line.locationName,
              taxCodeId: line.taxCodeId,
              taxCode: line.taxCode,
              taxDescription: line.taxDescription,
              taxDisplayLabel: line.taxDisplayLabel,
              taxRate: line.taxRate,
              taxCalculationMethod: line.taxCalculationMethod,
              taxAmount: line.taxAmount,
              lineSubtotal: line.lineSubtotal,
              lineTotal: line.lineTotal,
              remarks: line.remarks,
            })),
          },
        },
        include: { lines: true },
      });

      const createdLineByNo = new Map(deliveryOrder.lines.map((line) => [line.lineNo, line]));

      for (const line of data.lines) {
        if (!line.sourceLineId || !line.sourceTransactionId) continue;
        const targetLine = createdLineByNo.get(line.lineNo);
        if (!targetLine) continue;
        await tx.salesTransactionLineLink.create({
          data: {
            sourceLineId: line.sourceLineId,
            targetLineId: targetLine.id,
            sourceTransactionId: line.sourceTransactionId,
            targetTransactionId: deliveryOrder.id,
            linkType: "DELIVERED_TO",
            qty: line.qty,
          },
        });
      }

      for (const sourceTransactionId of data.sourceTransactionIds) {
        await tx.salesTransactionLink.create({
          data: {
            sourceTransactionId,
            targetTransactionId: deliveryOrder.id,
            linkType: "GENERATED_TO",
          },
        });
      }

      await createStockIssueForDeliveryOrder(tx, admin.id, deliveryOrder, data.lines, body);
      await refreshSalesOrderStatuses(tx, data.sourceTransactionIds);

      return deliveryOrder;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CREATE",
      entityType: "SALES_DELIVERY_ORDER",
      entityId: created.id,
      description: `Created Delivery Order ${created.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: created });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create delivery order." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
