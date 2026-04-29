import {
  NextResponse } from "next/server";
import { Prisma,
  SalesTransactionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireAdvisoryLock,
  acquireStockMutationLocks,
  buildLedgerValues,
  createStoredQtyDecimal,
  getStockBalance,
} from "@/lib/stock";

type SalesInvoiceLinePayload = {
  sourceLineId?: string | null;
  sourceTransactionId?: string | null;
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  uom?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  claimAmount?: number | string | null;
  discountRate?: number | string | null;
  discountType?: string | null;
  locationId?: string | null;
  batchNo?: string | null;
  serialNos?: string[] | null;
  taxCodeId?: string | null;
  remarks?: string | null;
};

function normalizeDate(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Document Date is invalid.");
  return date;
}


function getDecimalPlaces(value: unknown, fallback = 2) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(6, Math.trunc(numeric)));
}

async function loadStockNumberFormat(tx: Prisma.TransactionClient) {
  const config = await tx.stockConfiguration.findUnique({
    where: { id: "default" },
    select: {
      qtyDecimalPlaces: true,
      unitCostDecimalPlaces: true,
      priceDecimalPlaces: true,
    },
  });

  return {
    qtyDecimalPlaces: getDecimalPlaces(config?.qtyDecimalPlaces, 2),
    unitCostDecimalPlaces: getDecimalPlaces(config?.unitCostDecimalPlaces, 2),
    priceDecimalPlaces: getDecimalPlaces(config?.priceDecimalPlaces, 2),
  };
}

function decimalWithPlaces(value: number | string | null | undefined, decimalPlaces: number, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(decimalPlaces));
}

function qtyDecimalWithPlaces(value: number | string | null | undefined, decimalPlaces: number) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Quantity must be greater than zero.");
  return new Prisma.Decimal(numeric.toFixed(decimalPlaces));
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSerialNumbers(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const serialNo of normalized) {
    const key = serialNo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(serialNo);
  }
  return unique;
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

function withCancellationDetails<T extends Record<string, any>>(transaction: T) {
  return {
    ...transaction,
    cancelReason: transaction.cancelReason ?? null,
    cancelledAt: transaction.cancelledAt ?? null,
    cancelledBy: transaction.cancelledByAdmin?.name ?? null,
    cancelledByName: transaction.cancelledByAdmin?.name ?? null,
    cancelledByAdminName: transaction.cancelledByAdmin?.name ?? null,
  };
}


function sanitizeMoneyAmount(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function isAllowedPaymentMode(value: string) {
  return ["CASH", "CARD", "BANK_TRANSFER", "QR"].includes(value);
}

function normalizePaymentDate(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const paymentDate = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(paymentDate.getTime())) throw new Error("Payment Date is invalid.");
  return paymentDate;
}

function getPaymentMode(value: unknown) {
  const paymentMode = String(value || "CASH").trim().toUpperCase();
  if (!isAllowedPaymentMode(paymentMode)) throw new Error("Invalid payment mode.");
  return paymentMode;
}

function getPaymentInput(body: any) {
  const amount = sanitizeMoneyAmount(body?.paymentAmount);
  const paymentMode = getPaymentMode(body?.paymentMode);
  const paymentDate = normalizePaymentDate(body?.paymentDate);
  return { amount, paymentMode, paymentDate };
}

function calculateSalesPaymentSummary(payments: Array<{ amount?: Prisma.Decimal | number | string | null }>, grandTotal: Prisma.Decimal | number | string | null | undefined) {
  const total = toNumber(grandTotal);
  const totalPaid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  const roundedTotalPaid = Math.round((totalPaid + Number.EPSILON) * 100) / 100;
  const outstandingBalance = Math.max(0, Math.round((total - roundedTotalPaid + Number.EPSILON) * 100) / 100);
  return {
    totalPaid: roundedTotalPaid,
    outstandingBalance,
    paymentStatus: total <= 0 || roundedTotalPaid >= total ? "PAID" : roundedTotalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID",
  };
}

function getSalesInvoiceStatusForPayment(grandTotal: Prisma.Decimal | number | string, totalPaid: number) {
  const total = toNumber(grandTotal);
  if (total <= 0 || totalPaid >= total) return "COMPLETED" as SalesTransactionStatus;
  return "OPEN" as SalesTransactionStatus;
}

function withPaymentSummary<T extends Record<string, any>>(transaction: T) {
  const payments = Array.isArray(transaction.payments) ? transaction.payments : [];
  const summary = calculateSalesPaymentSummary(payments, transaction.grandTotal);
  return { ...transaction, payments, totalPaid: summary.totalPaid, outstandingBalance: summary.outstandingBalance, paymentStatus: summary.paymentStatus };
}

function validatePaymentAmount(paymentAmount: number, grandTotal: Prisma.Decimal | number | string, existingPaid = 0) {
  const outstanding = Math.max(0, Math.round((toNumber(grandTotal) - existingPaid + Number.EPSILON) * 100) / 100);
  if (paymentAmount > outstanding) throw new Error("Payment amount cannot exceed the outstanding balance.");
}

async function createSalesTransactionPaymentIfNeeded(tx: Prisma.TransactionClient, transactionId: string, adminId: string, paymentInput: { amount: number; paymentMode: string; paymentDate: Date }) {
  if (paymentInput.amount <= 0) return null;
  return tx.salesTransactionPayment.create({
    data: { salesTransactionId: transactionId, paymentDate: paymentInput.paymentDate, paymentMode: paymentInput.paymentMode, amount: new Prisma.Decimal(paymentInput.amount.toFixed(2)), createdByAdminId: adminId },
  });
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

  if (!year || !month || !day) throw new Error("Unable to generate sales invoice date prefix.");
  return { year, month, day };
}

function buildSalesDocumentNumberLockKey(docType: string, documentDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(documentDate);
  return `sales-docno:${docType}:${year}${month}${day}`;
}

async function generateSalesInvoiceNo(tx: Prisma.TransactionClient, docDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(docDate);
  const prefix = `INV-${year}${month}${day}`;
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`);

  const existing = await tx.salesTransaction.findMany({
    where: { docType: "INV", docNo: { startsWith: `${prefix}-` } },
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
  if (!/^INV-\d{8}-\d{4}$/.test(docNo)) {
    throw new Error("Sales Invoice No must use INV-YYYYMMDD-0001 format.");
  }
  return docNo;
}

function sumLinkedQty(
  line: {
    sourceLineLinks?: Array<{ linkType?: string | null; qty?: Prisma.Decimal | number | string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
  },
  linkType: "INVOICED_TO"
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}


function sumLinkedAmount(
  line: {
    sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
  },
  linkType: "INVOICED_TO"
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
}

function withSalesLineProgress(line: any) {
  const itemType = line.inventoryProduct?.itemType || line.itemType || "STOCK_ITEM";
  const orderedQty = toNumber(line.qty);
  const invoicedQty = sumLinkedQty(line, "INVOICED_TO");
  const orderedAmount = toNumber(line.lineTotal);
  const invoicedAmount = sumLinkedAmount(line, "INVOICED_TO");

  return {
    ...line,
    itemType,
    orderedQty,
    invoicedQty,
    orderedAmount,
    invoicedAmount,
    remainingInvoiceQty: Math.max(0, orderedQty - invoicedQty),
    remainingInvoiceAmount: Math.max(0, orderedAmount - invoicedAmount),
  };
}

function calculateSalesOrderStatus(lines: Array<{ itemType?: string; orderedQty: number; invoicedQty: number; orderedAmount?: number; invoicedAmount?: number }>) {
  if (lines.length === 0) return "OPEN" as SalesTransactionStatus;

  const hasAnyProgress = lines.some((line) =>
    line.itemType === "SERVICE_ITEM"
      ? Number(line.invoicedAmount || 0) > 0
      : line.invoicedQty > 0
  );
  const isFullyInvoiced = lines.every((line) =>
    line.itemType === "SERVICE_ITEM"
      ? Number(line.invoicedAmount || 0) >= Number(line.orderedAmount || 0)
      : line.invoicedQty >= line.orderedQty
  );

  if (isFullyInvoiced) return "COMPLETED" as SalesTransactionStatus;
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
            inventoryProduct: { select: { itemType: true } },
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

async function refreshDeliveryOrderStatuses(tx: Prisma.TransactionClient, sourceTransactionIds: string[]) {
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
            inventoryProduct: { select: { itemType: true } },
            sourceLineLinks: {
              include: {
                targetTransaction: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });

    if (!source || source.docType !== "DO" || source.status === "CANCELLED") continue;

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
      inventoryProduct: { select: { itemType: true } },
      sourceLineLinks: {
        include: {
          targetTransaction: { select: { id: true, status: true } },
        },
      },
    },
  });

  return new Map(sourceLines.map((line) => [line.id, withSalesLineProgress(line)]));
}

function buildInvoiceLine(
  line: SalesInvoiceLinePayload,
  lineNo: number,
  productMap: Map<string, any>,
  locationMap: Map<string, any>,
  sourceLineMap: Map<string, any>,
  numberFormat: { qtyDecimalPlaces: number; priceDecimalPlaces: number }
) {
  const sourceLineId = normalizeText(line.sourceLineId);
  const sourceLine = sourceLineId ? sourceLineMap.get(sourceLineId) : null;
  const inventoryProductId = normalizeText(line.inventoryProductId) || sourceLine?.inventoryProductId || null;
  const product = inventoryProductId ? productMap.get(inventoryProductId) : null;
  const locationId = normalizeText(line.locationId) || sourceLine?.locationId || null;
  const location = locationId ? locationMap.get(locationId) : null;

  const productCode = normalizeText(line.productCode) || sourceLine?.productCode || product?.code || "";
  const productDescription = normalizeText(line.productDescription) || sourceLine?.productDescription || product?.description || "";
  const itemType = product?.itemType || sourceLine?.itemType || "STOCK_ITEM";
  const isServiceItem = itemType === "SERVICE_ITEM";
  const uom = (normalizeText(line.uom) || sourceLine?.uom || product?.baseUom || "UNIT").toUpperCase();
  const qty = qtyDecimalWithPlaces(line.qty, numberFormat.qtyDecimalPlaces);
  const requestedClaimAmount = decimalWithPlaces(line.claimAmount ?? line.unitPrice, numberFormat.priceDecimalPlaces, sourceLine ? Math.max(0, toNumber(sourceLine.remainingInvoiceAmount)) : product ? Number(product.sellingPrice ?? 0) : 0);
  const unitPrice = isServiceItem ? requestedClaimAmount : decimalWithPlaces(line.unitPrice, numberFormat.priceDecimalPlaces, sourceLine ? toNumber(sourceLine.unitPrice) : product ? Number(product.sellingPrice ?? 0) : 0);
  const discountType = String(line.discountType || sourceLine?.discountType || "PERCENT").toUpperCase() === "AMOUNT" ? "AMOUNT" : "PERCENT";
  const batchNo = normalizeText((line as any).batchNo)?.toUpperCase() || null;
  const serialNos = normalizeSerialNumbers((line as any).serialNos);
  const discountRate = discountType === "PERCENT" ? decimal(line.discountRate, sourceLine ? toNumber(sourceLine.discountRate) : 0) : new Prisma.Decimal(0);
  const rawDiscountValue = decimal(line.discountRate, sourceLine ? toNumber(sourceLine.discountRate) : 0);
  const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
  const discountAmount = discountType === "AMOUNT"
    ? Prisma.Decimal.min(rawDiscountValue, lineSubtotal).toDecimalPlaces(2)
    : lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
  const taxableAmount = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

  if (!productCode || !productDescription) throw new Error(`Product line ${lineNo} is missing product information.`);
  if (!isServiceItem && (!locationId || !location)) throw new Error(`Product line ${lineNo} requires a valid stock location.`);

  if (sourceLine) {
    if (!(["DO", "SO"].includes(sourceLine.transaction?.docType || ""))) throw new Error("Sales Invoice can only generate from Delivery Order or Sales Order.");
    if (sourceLine.transaction?.status === "CANCELLED") throw new Error(`${sourceLine.transaction?.docNo || "Source Document"} is cancelled.`);
    if (isServiceItem) {
      const remainingAmount = Number(sourceLine.remainingInvoiceAmount || 0);
      if (toNumber(requestedClaimAmount) > remainingAmount) {
        throw new Error(`${productCode} claim amount exceeds remaining source document amount.`);
      }
    } else {
      const remaining = Number(sourceLine.remainingInvoiceQty || 0);
      if (toNumber(qty) > remaining) {
        throw new Error(`${productCode} invoice qty exceeds remaining source document qty.`);
      }
    }
  }

  if (!isServiceItem && product?.batchTracking && !batchNo) {
    throw new Error(`${productCode} requires Batch No.`);
  }
  if (!isServiceItem && product?.serialNumberTracking) {
    if (serialNos.length === 0) throw new Error(`${productCode} requires S/N No.`);
    if (toNumber(qty) !== serialNos.length) throw new Error(`${productCode} quantity must match selected S/N count.`);
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
    itemType,
    claimAmount: isServiceItem ? requestedClaimAmount : null,
    locationId: location?.id || null,
    batchNo: isServiceItem ? null : batchNo,
    serialNos,
    batchTracking: !isServiceItem && Boolean(product?.batchTracking),
    serialNumberTracking: !isServiceItem && Boolean(product?.serialNumberTracking),
    locationCode: location?.code || null,
    locationName: location?.name || null,
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

async function buildSalesInvoiceData(body: any, tx: Prisma.TransactionClient) {
  const docDate = normalizeDate(body.docDate);
  const customerId = normalizeText(body.customerId);
  if (!customerId) throw new Error("Customer is required.");

  const rawLines = Array.isArray(body.lines) ? (body.lines as SalesInvoiceLinePayload[]) : [];
  if (rawLines.length === 0) throw new Error("Please add at least one product line.");

  const customer = await tx.user.findFirst({
    where: { id: customerId, role: "CUSTOMER" },
    include: { agent: true },
  });
  if (!customer) throw new Error("Selected customer is invalid.");

  const numberFormat = await loadStockNumberFormat(tx);

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
            itemType: true,
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

  const lines = rawLines.map((line, index) => buildInvoiceLine(line, index + 1, productMap, locationMap, sourceLineMap, numberFormat));

  for (const line of lines) {
    const product = line.inventoryProductId ? productMap.get(line.inventoryProductId) : null;
    if (!product) throw new Error(`${line.productCode} product is invalid.`);
    if (product.itemType !== "SERVICE_ITEM" && !product.trackInventory) {
      throw new Error(`${line.productCode} is not a tracked stock item and cannot be delivered through Invoice stock out.`);
    }
  }

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxableSubtotal = subtotal.minus(discountTotal).toDecimalPlaces(2);
  const taxTotal = new Prisma.Decimal(0);
  const grandTotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

  const sourceLines = Array.from(sourceLineMap.values()) as any[];
  const generatedFromDocNos = Array.from(new Set(sourceLines.map((line: any) => line.transaction?.docNo).filter(Boolean)));
  const sourceDocTypes = Array.from(new Set(sourceLines.map((line: any) => line.transaction?.docType).filter(Boolean)));

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
    sourceDocTypes,
    shouldCreateStockIssue: !sourceDocTypes.includes("DO"),
  };
}

async function createStockIssueForSalesInvoice(
  tx: Prisma.TransactionClient,
  adminId: string,
  salesInvoice: any,
  lines: Array<any>,
  body: any
) {
  const stockLines = lines.filter((line) => line.itemType !== "SERVICE_ITEM");
  if (stockLines.length === 0) return null;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireStockMutationLocks(
    tx,
    stockLines.map((line) => ({
      inventoryProductId: line.inventoryProductId!,
      locationId: line.locationId,
      batchNo: line.batchNo,
      serialNos: line.serialNos || [],
    }))
  );

  for (const line of stockLines) {
    const requiredQty = toNumber(line.qty);
    if (line.serialNumberTracking) {
      const availableCount = await tx.inventorySerial.count({
        where: {
          inventoryProductId: line.inventoryProductId!,
          currentLocationId: line.locationId,
          status: "IN_STOCK",
          serialNo: { in: line.serialNos || [] },
          ...(line.batchNo ? { inventoryBatch: { is: { batchNo: line.batchNo } } } : {}),
        },
      });
      if (availableCount !== (line.serialNos || []).length) {
        throw new Error(`${line.productCode} has one or more unavailable S/N at the selected location${line.batchNo ? " / batch" : ""}.`);
      }
      continue;
    }

    const balance = await getStockBalance(tx, line.inventoryProductId!, line.locationId, { batchNo: line.batchNo });
    if (balance < requiredQty && !config.allowNegativeStock) {
      throw new Error(`Insufficient stock for ${line.productCode}. Current balance: ${balance}. Required: ${requiredQty}.`);
    }
  }

  for (const line of stockLines) {
    const baseRemarks = line.remarks || normalizeText(body.stockRemarks) || salesInvoice.remarks || `Sales stock out for ${salesInvoice.docNo}`;

    if (line.serialNumberTracking) {
      for (const serialNo of line.serialNos || []) {
        const serialRecord = await tx.inventorySerial.findUnique({
          where: {
            inventoryProductId_serialNo: {
              inventoryProductId: line.inventoryProductId!,
              serialNo,
            },
          },
          include: { inventoryBatch: true },
        });

        if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== line.locationId) {
          throw new Error(`Serial No ${serialNo} is not available at the selected location.`);
        }
        if (line.batchNo && serialRecord.inventoryBatch?.batchNo !== line.batchNo) {
          throw new Error(`Serial No ${serialNo} does not belong to Batch No ${line.batchNo}.`);
        }

        const ledgerValues = buildLedgerValues(createStoredQtyDecimal(1), "OUT");
        await tx.stockLedger.create({
          data: {
            movementDate: salesInvoice.docDate,
            movementType: "SI",
            movementDirection: "OUT",
            ...ledgerValues,
            batchNo: line.batchNo || serialRecord.inventoryBatch?.batchNo || null,
            inventoryProductId: line.inventoryProductId!,
            locationId: line.locationId,
            transactionId: null,
            transactionLineId: null,
            referenceNo: salesInvoice.docNo,
            referenceText: `Sales Invoice ${salesInvoice.docNo}`,
            sourceType: "SALES_INVOICE",
            sourceId: salesInvoice.id,
            remarks: `${baseRemarks} | SERIAL_NO=${serialNo}`,
          },
        });

        await tx.inventorySerial.update({
          where: { id: serialRecord.id },
          data: { status: "OUT_OF_STOCK", currentLocationId: null },
        });
      }
      continue;
    }

    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(line.qty), "OUT");
    await tx.stockLedger.create({
      data: {
        movementDate: salesInvoice.docDate,
        movementType: "SI",
        movementDirection: "OUT",
        ...ledgerValues,
        batchNo: line.batchNo,
        inventoryProductId: line.inventoryProductId!,
        locationId: line.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: salesInvoice.docNo,
        referenceText: `Sales Invoice ${salesInvoice.docNo}`,
        sourceType: "SALES_INVOICE",
        sourceId: salesInvoice.id,
        remarks: baseRemarks,
      },
    });
  }

  return null;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("nextDocNo") === "1") {
      const docDate = normalizeDate(searchParams.get("docDate"));
      const docNo = await db.$transaction(async (tx) => {
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("INV", docDate));
        return generateSalesInvoiceNo(tx, docDate);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";

    const rows = await db.salesTransaction.findMany({
      where: {
        docType: "INV",
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
        payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            sourceLineLinks: {
              include: {
                sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
              },
            },
          },
        },
      },
    });

    const stockIssues = rows.length
      ? await db.stockTransaction.findMany({
          where: { transactionType: "SI", reference: { in: rows.map((row) => row.docNo) }, status: { not: "CANCELLED" } },
          include: { lines: { orderBy: { createdAt: "asc" }, include: { serialEntries: { orderBy: { serialNo: "asc" } } } } },
        })
      : [];
    const stockIssueByReference = new Map(stockIssues.map((item) => [item.reference || "", item]));

    const sourceDeliveryOrderIds = Array.from(new Set(
      rows.flatMap((row) =>
        (row.targetLinks || [])
          .map((link) => link.sourceTransaction)
          .filter((source) => source?.docType === "DO" && source.status !== "CANCELLED")
          .map((source) => source!.id)
      )
    ));

    const sourceDeliveryLedgerRows = sourceDeliveryOrderIds.length
      ? await db.stockLedger.findMany({
          where: {
            sourceType: "SALES_DELIVERY_ORDER",
            sourceId: { in: sourceDeliveryOrderIds },
            movementDirection: "OUT",
          },
          orderBy: [{ createdAt: "asc" }],
          select: { sourceId: true, inventoryProductId: true, locationId: true, batchNo: true, remarks: true },
        })
      : [];

    const sourceDeliveryStockMap = new Map<string, { batchNo: string | null; serialNos: string[] }>();
    for (const row of sourceDeliveryLedgerRows) {
      const sourceId = String(row.sourceId || "");
      const productId = String(row.inventoryProductId || "");
      const locationId = String(row.locationId || "");
      if (!sourceId || !productId || !locationId) continue;

      const key = `${sourceId}__${productId}__${locationId}`;
      const existing = sourceDeliveryStockMap.get(key) || { batchNo: row.batchNo || null, serialNos: [] };
      if (!existing.batchNo && row.batchNo) existing.batchNo = row.batchNo;
      const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
      const serialNo = serialMatch?.[1]?.trim();
      if (serialNo && !existing.serialNos.some((item) => item.toUpperCase() === serialNo.toUpperCase())) {
        existing.serialNos.push(serialNo);
      }
      sourceDeliveryStockMap.set(key, existing);
    }

    const transactions = rows.map((row) => {
      const stockIssue = stockIssueByReference.get(row.docNo);
      return {
        ...withPaymentSummary(withCancellationDetails(row)),
        lines: row.lines.map((line, index) => {
          const sourceDeliveryLink = (line.sourceLineLinks || []).find((link) =>
            link.sourceTransaction?.docType === "DO" && link.sourceTransaction?.status !== "CANCELLED"
          );
          const sourceDeliveryStock = sourceDeliveryLink
            ? sourceDeliveryStockMap.get(`${sourceDeliveryLink.sourceTransactionId}__${line.inventoryProductId || ""}__${line.locationId || ""}`)
            : null;

          return {
            ...line,
            batchNo: stockIssue?.lines[index]?.batchNo || sourceDeliveryStock?.batchNo || null,
            serialNos: stockIssue?.lines[index]?.serialEntries.map((entry) => entry.serialNo) || sourceDeliveryStock?.serialNos || [],
          };
        }),
        sourceLinks: row.targetLinks.map((link) => ({
          sourceTransaction: link.sourceTransaction,
        })),
      };
    });

    return NextResponse.json({ ok: true, transactions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load sales invoices." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const created = await db.$transaction(async (tx) => {
      const data = await buildSalesInvoiceData(body, tx);
      const paymentInput = getPaymentInput(body);
      validatePaymentAmount(paymentInput.amount, data.grandTotal, 0);
      const initialStatus = getSalesInvoiceStatusForPayment(data.grandTotal, paymentInput.amount);

      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("INV", data.docDate));
      for (const sourceTransactionId of data.sourceTransactionIds) {
        await acquireAdvisoryLock(tx, `sales-transaction:${sourceTransactionId}`);
      }

      const docNo = data.requestedDocNo || await generateSalesInvoiceNo(tx, data.docDate);
      const duplicate = await tx.salesTransaction.findUnique({ where: { docNo }, select: { id: true } });
      if (duplicate) throw new Error("Document No already exists. Please save again so the system can generate the next available number.");

      const salesInvoice = await tx.salesTransaction.create({
        data: {
          docType: "INV",
          docNo,
          docDate: data.docDate,
          docDesc: data.docDesc,
          status: initialStatus,
          customerId: data.customer.id,
          customerAccountNo: data.customer.customerAccountNo,
          customerName: data.customer.name,
          billingAddressLine1: normalizeText(body.billingAddressLine1) ?? data.customer.billingAddressLine1,
          billingAddressLine2: normalizeText(body.billingAddressLine2) ?? data.customer.billingAddressLine2,
          billingAddressLine3: normalizeText(body.billingAddressLine3) ?? data.customer.billingAddressLine3,
          billingAddressLine4: normalizeText(body.billingAddressLine4) ?? data.customer.billingAddressLine4,
          billingCity: normalizeText(body.billingCity) ?? data.customer.billingCity,
          billingPostCode: normalizeText(body.billingPostCode) ?? data.customer.billingPostCode,
          billingCountryCode: normalizeText(body.billingCountryCode) ?? data.customer.billingCountryCode,
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
        include: { lines: true, payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } },
      });

      const createdLineByNo = new Map(salesInvoice.lines.map((line) => [line.lineNo, line]));

      for (const line of data.lines) {
        if (!line.sourceLineId || !line.sourceTransactionId) continue;
        const targetLine = createdLineByNo.get(line.lineNo);
        if (!targetLine) continue;
        await tx.salesTransactionLineLink.create({
          data: {
            sourceLineId: line.sourceLineId,
            targetLineId: targetLine.id,
            sourceTransactionId: line.sourceTransactionId,
            targetTransactionId: salesInvoice.id,
            linkType: "INVOICED_TO",
            qty: line.itemType === "SERVICE_ITEM" ? new Prisma.Decimal(0) : line.qty,
            claimAmount: line.itemType === "SERVICE_ITEM" ? line.claimAmount : null,
          },
        });
      }

      for (const sourceTransactionId of data.sourceTransactionIds) {
        await tx.salesTransactionLink.create({
          data: {
            sourceTransactionId,
            targetTransactionId: salesInvoice.id,
            linkType: "GENERATED_TO",
          },
        });
      }

      if (data.shouldCreateStockIssue) {
        await createStockIssueForSalesInvoice(tx, admin.id, salesInvoice, data.lines, body);
      }
      await createSalesTransactionPaymentIfNeeded(tx, salesInvoice.id, admin.id, paymentInput);
      await refreshSalesOrderStatuses(tx, data.sourceTransactionIds);
      await refreshDeliveryOrderStatuses(tx, data.sourceTransactionIds);

      const created = await tx.salesTransaction.findUnique({
        where: { id: salesInvoice.id },
        include: { lines: true, payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } },
      });
      return created || salesInvoice;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CREATE",
      entityType: "SALES_INVOICE",
      entityId: created.id,
      description: `Created Sales Invoice ${created.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: withPaymentSummary(created) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create sales invoice." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
