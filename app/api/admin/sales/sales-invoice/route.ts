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


type StockPickingRow = {
  sourceId?: string | null;
  inventoryProductId?: string | null;
  locationId?: string | null;
  batchNo?: string | null;
  remarks?: string | null;
};

function extractSerialNoFromRemarks(value: string | null | undefined) {
  const match = String(value || "").match(/SERIAL_NO=([^|]+)/);
  return match ? match[1].trim() : "";
}

function uniqueStringList(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function getSavedStockPickingFromLedger(
  rows: StockPickingRow[],
  sourceId: string,
  line: { inventoryProductId?: string | null; locationId?: string | null }
) {
  const matchingRows = rows.filter((row) => {
    if (row.sourceId !== sourceId) return false;
    if (line.inventoryProductId && row.inventoryProductId !== line.inventoryProductId) return false;
    if (line.locationId && row.locationId && row.locationId !== line.locationId) return false;
    return true;
  });

  const batchNo = uniqueStringList(matchingRows.map((row) => row.batchNo))[0] || null;
  const serialNos = uniqueStringList(matchingRows.map((row) => extractSerialNoFromRemarks(row.remarks)));
  return { batchNo, serialNos };
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


async function loadTaxSettings(tx: Prisma.TransactionClient) {
  const config = await tx.taxConfiguration.findUnique({ where: { id: "default" } });
  const taxCodes = await tx.taxCode.findMany({ where: { isActive: true } });

  return {
    enabled: Boolean(config?.taxModuleEnabled),
    mode: config?.taxCalculationMode === "LINE_ITEM" ? "LINE_ITEM" : "TRANSACTION",
    taxCodes: new Map(taxCodes.map((taxCode) => [taxCode.id, taxCode])),
  };
}

function calculateTaxAmount(taxableAmount: Prisma.Decimal, taxRate: Prisma.Decimal | number | string | null | undefined, method: string | null | undefined) {
  const rate = new Prisma.Decimal(Number(taxRate ?? 0));
  if (rate.lte(0) || taxableAmount.lte(0)) return new Prisma.Decimal(0);

  if (method === "INCLUSIVE") {
    return taxableAmount.mul(rate).div(new Prisma.Decimal(100).plus(rate)).toDecimalPlaces(2);
  }

  return taxableAmount.mul(rate).div(100).toDecimalPlaces(2);
}

function applyLineTax(line: any, taxSettings: Awaited<ReturnType<typeof loadTaxSettings>>) {
  const requestedTaxCodeId = normalizeText(line.taxCodeId);
  const taxCode = taxSettings.enabled && taxSettings.mode === "LINE_ITEM" && requestedTaxCodeId ? taxSettings.taxCodes.get(requestedTaxCodeId) : null;
  const taxableAmount = line.lineSubtotal.minus(line.discountAmount).toDecimalPlaces(2);
  const taxAmount = taxCode ? calculateTaxAmount(taxableAmount, taxCode.rate, taxCode.calculationMethod) : new Prisma.Decimal(0);
  const lineTotal = taxCode?.calculationMethod === "INCLUSIVE" ? taxableAmount : taxableAmount.plus(taxAmount).toDecimalPlaces(2);

  return {
    ...line,
    taxCodeId: taxCode?.id || null,
    taxCode: taxCode?.code || null,
    taxDescription: taxCode?.description || null,
    taxDisplayLabel: taxCode?.displayLabel || taxCode?.code || null,
    taxRate: taxCode?.rate || new Prisma.Decimal(0),
    taxCalculationMethod: taxCode?.calculationMethod || null,
    taxAmount,
    lineTotal,
  };
}

function calculateTransactionTotals(
  lines: any[],
  taxSettings: Awaited<ReturnType<typeof loadTaxSettings>>,
  transactionTaxCodeId: string | null
): {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxableSubtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  transactionTaxCode: any | null;
} {
  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxableSubtotal = subtotal.minus(discountTotal).toDecimalPlaces(2);

  if (taxSettings.enabled && taxSettings.mode === "LINE_ITEM") {
    return {
      subtotal,
      discountTotal,
      taxableSubtotal,
      taxTotal: lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2),
      grandTotal: lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2),
      transactionTaxCode: null,
    };
  }

  const transactionTaxCode = taxSettings.enabled && transactionTaxCodeId ? taxSettings.taxCodes.get(transactionTaxCodeId) || null : null;
  const taxTotal = transactionTaxCode ? calculateTaxAmount(taxableSubtotal, transactionTaxCode.rate, transactionTaxCode.calculationMethod) : new Prisma.Decimal(0);
  const grandTotal = transactionTaxCode?.calculationMethod === "INCLUSIVE" ? taxableSubtotal : taxableSubtotal.plus(taxTotal).toDecimalPlaces(2);

  return {
    subtotal,
    discountTotal,
    taxableSubtotal,
    taxTotal,
    grandTotal,
    transactionTaxCode,
  };
}

function calculateSalesAdjustmentSummary(
  lines?: Array<{ sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null; docType?: string | null } | null }> }>,
  sourceLinks?: Array<{ targetTransaction?: { status?: string | null; docType?: string | null; grandTotal?: Prisma.Decimal | number | string | null } | null }>
) {
  const lineCredited = (lines || []).reduce((lineSum, line) => {
    return lineSum + (line.sourceLineLinks || [])
      .filter((link) => link.linkType === "CREDITED_TO")
      .filter((link) => link.targetTransaction?.status !== "CANCELLED")
      .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
  }, 0);

  const linkedCreditNotes = (sourceLinks || [])
    .filter((link) => link.targetTransaction?.docType === "CN")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.targetTransaction?.grandTotal), 0);

  const linkedDebitNotes = (sourceLinks || [])
    .filter((link) => link.targetTransaction?.docType === "DN")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.targetTransaction?.grandTotal), 0);

  // Prefer linked CN/DN document totals when available, because they represent the posted adjustment documents.
  // Fall back to line-level CREDITED_TO links for older data/partial payloads.
  const totalCredited = linkedCreditNotes > 0 ? linkedCreditNotes : lineCredited;
  const totalDebited = linkedDebitNotes;

  return {
    totalCredited: Math.round((totalCredited + Number.EPSILON) * 100) / 100,
    totalDebited: Math.round((totalDebited + Number.EPSILON) * 100) / 100,
  };
}

function calculateSalesPaymentSummary(
  payments: Array<{ amount?: Prisma.Decimal | number | string | null }>,
  grandTotal: Prisma.Decimal | number | string | null | undefined,
  lines?: Array<{ sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null; docType?: string | null } | null }> }>,
  sourceLinks?: Array<{ targetTransaction?: { status?: string | null; docType?: string | null; grandTotal?: Prisma.Decimal | number | string | null } | null }>
) {
  const total = toNumber(grandTotal);
  const totalPaid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  const roundedTotalPaid = Math.round((totalPaid + Number.EPSILON) * 100) / 100;
  const adjustmentSummary = calculateSalesAdjustmentSummary(lines, sourceLinks);
  const adjustedGrandTotal = Math.max(0, Math.round((total - adjustmentSummary.totalCredited + adjustmentSummary.totalDebited + Number.EPSILON) * 100) / 100);
  const outstandingBalance = Math.max(0, Math.round((adjustedGrandTotal - roundedTotalPaid + Number.EPSILON) * 100) / 100);
  const paymentStatus = (() => {
    if (outstandingBalance <= 0) {
      if (roundedTotalPaid > 0 && (adjustmentSummary.totalCredited > 0 || adjustmentSummary.totalDebited > 0)) return "SETTLED";
      if (roundedTotalPaid <= 0 && adjustmentSummary.totalCredited > 0) return "CREDITED";
      return "PAID";
    }
    return roundedTotalPaid > 0 || adjustmentSummary.totalCredited > 0 || adjustmentSummary.totalDebited > 0 ? "PARTIALLY_PAID" : "UNPAID";
  })();

  return {
    totalPaid: roundedTotalPaid,
    totalCredited: adjustmentSummary.totalCredited,
    totalDebited: adjustmentSummary.totalDebited,
    adjustedGrandTotal,
    outstandingBalance,
    paymentStatus,
  };
}

function getSalesInvoiceStatusForPayment(grandTotal: Prisma.Decimal | number | string, totalPaid: number, totalCredited = 0, totalDebited = 0) {
  const adjustedTotal = Math.max(0, Math.round((toNumber(grandTotal) - totalCredited + totalDebited + Number.EPSILON) * 100) / 100);
  if (adjustedTotal <= 0 || totalPaid >= adjustedTotal) return "COMPLETED" as SalesTransactionStatus;
  return "OPEN" as SalesTransactionStatus;
}

function withPaymentSummary<T extends Record<string, any>>(transaction: T) {
  const payments = Array.isArray(transaction.payments) ? transaction.payments : [];
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  const sourceLinks = Array.isArray(transaction.sourceLinks) ? transaction.sourceLinks : [];
  const summary = calculateSalesPaymentSummary(payments, transaction.grandTotal, lines, sourceLinks);
  return { ...transaction, payments, totalPaid: summary.totalPaid, totalCredited: summary.totalCredited, totalDebited: summary.totalDebited, adjustedGrandTotal: summary.adjustedGrandTotal, outstandingBalance: summary.outstandingBalance, paymentStatus: summary.paymentStatus };
}

function validatePaymentAmount(paymentAmount: number, grandTotal: Prisma.Decimal | number | string, existingPaid = 0, totalCredited = 0, totalDebited = 0) {
  const adjustedTotal = Math.max(0, Math.round((toNumber(grandTotal) - totalCredited + totalDebited + Number.EPSILON) * 100) / 100);
  const outstanding = Math.max(0, Math.round((adjustedTotal - existingPaid + Number.EPSILON) * 100) / 100);
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
  linkType: "INVOICED_TO" | "RETURNED_TO"
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
  linkType: "INVOICED_TO" | "RETURNED_TO"
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
  const returnedQty = line.transaction?.docType === "DO" ? sumLinkedQty(line, "RETURNED_TO") : 0;
  const orderedAmount = toNumber(line.lineTotal);
  const invoicedAmount = sumLinkedAmount(line, "INVOICED_TO");
  const returnedAmount = line.transaction?.docType === "DO" ? sumLinkedAmount(line, "RETURNED_TO") : 0;

  return {
    ...line,
    itemType,
    orderedQty,
    invoicedQty,
    returnedQty,
    orderedAmount,
    invoicedAmount,
    returnedAmount,
    remainingInvoiceQty: Math.max(0, orderedQty - returnedQty - invoicedQty),
    remainingInvoiceAmount: Math.max(0, orderedAmount - returnedAmount - invoicedAmount),
  };
}

function calculateSalesOrderStatus(lines: Array<{ itemType?: string; orderedQty: number; invoicedQty: number; returnedQty?: number; orderedAmount?: number; invoicedAmount?: number; returnedAmount?: number }>) {
  if (lines.length === 0) return "OPEN" as SalesTransactionStatus;

  const hasAnyProgress = lines.some((line) =>
    line.itemType === "SERVICE_ITEM"
      ? Number(line.invoicedAmount || 0) > 0 || Number(line.returnedAmount || 0) > 0
      : line.invoicedQty > 0 || Number(line.returnedQty || 0) > 0
  );
  const isFullyInvoiced = lines.every((line) =>
    line.itemType === "SERVICE_ITEM"
      ? Number(line.invoicedAmount || 0) + Number(line.returnedAmount || 0) >= Number(line.orderedAmount || 0)
      : line.invoicedQty + Number(line.returnedQty || 0) >= line.orderedQty
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

    const lines = source.lines.map((line) => withSalesLineProgress({ ...line, transaction: { docType: source.docType } }));
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

    const lines = source.lines.map((line) => withSalesLineProgress({ ...line, transaction: { docType: source.docType } }));
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
    taxCodeId: normalizeText(line.taxCodeId) || sourceLine?.taxCodeId || null,
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

  const taxSettings = await loadTaxSettings(tx);
  const lines = rawLines
    .map((line, index) => buildInvoiceLine(line, index + 1, productMap, locationMap, sourceLineMap, numberFormat))
    .map((line) => applyLineTax(line, taxSettings));

  for (const line of lines) {
    const product = line.inventoryProductId ? productMap.get(line.inventoryProductId) : null;
    if (!product) throw new Error(`${line.productCode} product is invalid.`);
    if (product.itemType !== "SERVICE_ITEM" && !product.trackInventory) {
      throw new Error(`${line.productCode} is not a tracked stock item and cannot be delivered through Invoice stock out.`);
    }
  }

  const totals = calculateTransactionTotals(lines, taxSettings, normalizeText(body.transactionTaxCodeId));
  const { subtotal, discountTotal, taxableSubtotal, taxTotal, grandTotal, transactionTaxCode } = totals;

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
    transactionTaxCode,
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
            targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } },
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
                targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } },
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
    const stockLedgerRowsForSavedPicking = rows.length
      ? await db.stockLedger.findMany({
          where: { sourceType: "SALES_INVOICE", sourceId: { in: rows.map((row) => row.id) }, movementDirection: "OUT" },
          orderBy: [{ createdAt: "asc" }],
          select: { sourceId: true, inventoryProductId: true, locationId: true, batchNo: true, remarks: true },
        })
      : [];

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
            batchNo: stockIssue?.lines[index]?.batchNo || getSavedStockPickingFromLedger(stockLedgerRowsForSavedPicking, row.id, line).batchNo || sourceDeliveryStock?.batchNo || null,
            serialNos: uniqueStringList([...(stockIssue?.lines[index]?.serialEntries.map((entry) => entry.serialNo) || []), ...getSavedStockPickingFromLedger(stockLedgerRowsForSavedPicking, row.id, line).serialNos, ...(sourceDeliveryStock?.serialNos || [])]),
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
          taxCodeId: data.transactionTaxCode?.id || null,
          taxCode: data.transactionTaxCode?.code || null,
          taxDescription: data.transactionTaxCode?.description || null,
          taxDisplayLabel: data.transactionTaxCode?.displayLabel || data.transactionTaxCode?.code || null,
          taxRate: data.transactionTaxCode?.rate || null,
          taxCalculationMethod: data.transactionTaxCode?.calculationMethod || null,
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
