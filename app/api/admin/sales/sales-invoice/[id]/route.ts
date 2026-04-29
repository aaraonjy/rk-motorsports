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
  buildTransactionEntityLockKey,
  createStoredQtyDecimal,
  getStockBalance,
} from "@/lib/stock";
import { roundToDecimalPlaces, STOCK_STORAGE_DECIMAL_PLACES } from "@/lib/stock-format";

type Params = { params: Promise<{ id: string }> };

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
function isAllowedPaymentMode(value: string) { return ["CASH", "CARD", "BANK_TRANSFER", "QR"].includes(value); }
function normalizePaymentDate(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const paymentDate = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(paymentDate.getTime())) throw new Error("Payment Date is invalid.");
  return paymentDate;
}
function getPaymentMode(value: unknown) { const paymentMode = String(value || "CASH").trim().toUpperCase(); if (!isAllowedPaymentMode(paymentMode)) throw new Error("Invalid payment mode."); return paymentMode; }
function getPaymentInput(body: any) { return { amount: sanitizeMoneyAmount(body?.paymentAmount), paymentMode: getPaymentMode(body?.paymentMode), paymentDate: normalizePaymentDate(body?.paymentDate) }; }
function calculateSalesPaymentSummary(payments: Array<{ amount?: Prisma.Decimal | number | string | null }>, grandTotal: Prisma.Decimal | number | string | null | undefined) {
  const total = toNumber(grandTotal); const totalPaid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0); const roundedTotalPaid = Math.round((totalPaid + Number.EPSILON) * 100) / 100; const outstandingBalance = Math.max(0, Math.round((total - roundedTotalPaid + Number.EPSILON) * 100) / 100);
  return { totalPaid: roundedTotalPaid, outstandingBalance, paymentStatus: total <= 0 || roundedTotalPaid >= total ? "PAID" : roundedTotalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID" };
}
function getSalesInvoiceStatusForPayment(grandTotal: Prisma.Decimal | number | string, totalPaid: number) { const total = toNumber(grandTotal); if (total <= 0 || totalPaid >= total) return "COMPLETED" as SalesTransactionStatus; return "OPEN" as SalesTransactionStatus; }
function withPaymentSummary<T extends Record<string, any>>(transaction: T) { const payments = Array.isArray(transaction.payments) ? transaction.payments : []; const summary = calculateSalesPaymentSummary(payments, transaction.grandTotal); return { ...transaction, payments, totalPaid: summary.totalPaid, outstandingBalance: summary.outstandingBalance, paymentStatus: summary.paymentStatus }; }
function validatePaymentAmount(paymentAmount: number, grandTotal: Prisma.Decimal | number | string, existingPaid = 0) { const outstanding = Math.max(0, Math.round((toNumber(grandTotal) - existingPaid + Number.EPSILON) * 100) / 100); if (paymentAmount > outstanding) throw new Error("Payment amount cannot exceed the outstanding balance."); }
async function createSalesTransactionPaymentIfNeeded(tx: Prisma.TransactionClient, transactionId: string, adminId: string, paymentInput: { amount: number; paymentMode: string; paymentDate: Date }) { if (paymentInput.amount <= 0) return null; return tx.salesTransactionPayment.create({ data: { salesTransactionId: transactionId, paymentDate: paymentInput.paymentDate, paymentMode: paymentInput.paymentMode, amount: new Prisma.Decimal(paymentInput.amount.toFixed(2)), createdByAdminId: adminId } }); }


function roundQty(value: unknown) {
  return roundToDecimalPlaces(Number(value ?? 0), STOCK_STORAGE_DECIMAL_PLACES.qty);
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
      await tx.salesTransaction.update({ where: { id: source.id }, data: { status: nextStatus } });
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
      await tx.salesTransaction.update({ where: { id: source.id }, data: { status: nextStatus } });
    }
  }
}


type DirectSalesInvoiceLinePayload = {
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
    select: { qtyDecimalPlaces: true, unitCostDecimalPlaces: true, priceDecimalPlaces: true },
  });

  return {
    qtyDecimalPlaces: getDecimalPlaces(config?.qtyDecimalPlaces, 2),
    priceDecimalPlaces: getDecimalPlaces(config?.priceDecimalPlaces, 2),
  };
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

function basicDecimal(value: number | string | null | undefined, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(2));
}

function hasSalesOrderSource(transaction: { targetLinks?: Array<{ sourceTransaction?: { docType?: string | null; status?: string | null } | null }> }) {
  return (transaction.targetLinks || []).some((link) => ["SO", "DO"].includes(String(link.sourceTransaction?.docType || "")) && link.sourceTransaction?.status !== "CANCELLED");
}

function getBaseSalesInvoiceDocNo(docNo: string | null | undefined) {
  const value = String(docNo || "").trim().toUpperCase();
  const match = value.match(/^(INV-\d{8}-\d{4})(?:-(\d+))?$/);
  return match ? match[1] : value;
}

async function generateSalesInvoiceRevisionNo(tx: Prisma.TransactionClient, current: { id: string; docNo: string; revisedFromId?: string | null; revisedFrom?: { docNo?: string | null } | null }) {
  const baseDocNo = getBaseSalesInvoiceDocNo(current.revisedFrom?.docNo || current.docNo);
  const rows = await tx.salesTransaction.findMany({
    where: {
      docType: "INV",
      OR: [{ docNo: baseDocNo }, { docNo: { startsWith: `${baseDocNo}-` } }, { revisedFromId: current.revisedFromId || current.id }],
    },
    select: { docNo: true },
  });

  let maxRevision = 0;
  const pattern = new RegExp(`^${baseDocNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  for (const row of rows) {
    const match = String(row.docNo || "").match(pattern);
    if (!match) continue;
    const revisionNo = Number(match[1]);
    if (Number.isFinite(revisionNo) && revisionNo > maxRevision) maxRevision = revisionNo;
  }

  return `${baseDocNo}-${maxRevision + 1}`;
}

async function buildDirectSalesInvoiceData(body: any, tx: Prisma.TransactionClient) {
  const docDate = normalizeDate(body.docDate);
  const customerId = normalizeText(body.customerId);
  if (!customerId) throw new Error("Customer is required.");

  const rawLines = Array.isArray(body.lines) ? (body.lines as DirectSalesInvoiceLinePayload[]) : [];
  if (rawLines.length === 0) throw new Error("Please add at least one product line.");
  if (rawLines.some((line) => normalizeText((line as any).sourceLineId) || normalizeText((line as any).sourceTransactionId))) {
    throw new Error("Generated Sales Invoice lines cannot be edited directly. Please cancel and generate a new DO from the Sales Order.");
  }

  const customer = await tx.user.findFirst({ where: { id: customerId, role: "CUSTOMER" } });
  if (!customer) throw new Error("Selected customer is invalid.");

  const numberFormat = await loadStockNumberFormat(tx);
  const productIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.inventoryProductId)).filter(Boolean))) as string[];
  const locationIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.locationId)).filter(Boolean))) as string[];

  const [products, locations] = await Promise.all([
    tx.inventoryProduct.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, code: true, description: true, baseUom: true, sellingPrice: true, trackInventory: true, itemType: true, batchTracking: true, serialNumberTracking: true },
    }),
    tx.stockLocation.findMany({ where: { id: { in: locationIds }, isActive: true }, select: { id: true, code: true, name: true } }),
  ]);

  const productMap = new Map(products.map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((item) => [item.id, item]));

  const lines = rawLines.map((line, index) => {
    const lineNo = index + 1;
    const inventoryProductId = normalizeText(line.inventoryProductId);
    const product = inventoryProductId ? productMap.get(inventoryProductId) : null;
    const locationId = normalizeText(line.locationId);
    const location = locationId ? locationMap.get(locationId) : null;

    if (!product) throw new Error(`Product line ${lineNo} is missing product information.`);
    const isServiceItem = product.itemType === "SERVICE_ITEM";
    if (!isServiceItem && !product.trackInventory) throw new Error(`${product.code} is not a tracked stock item and cannot be delivered through DO stock out.`);
    if (!isServiceItem && !location) throw new Error(`Product line ${lineNo} requires a valid stock location.`);

    const qty = qtyDecimalWithPlaces(line.qty, numberFormat.qtyDecimalPlaces);
    const batchNo = isServiceItem ? null : normalizeText((line as any).batchNo)?.toUpperCase() || null;
    const serialNos = isServiceItem ? [] : normalizeSerialNumbers((line as any).serialNos);
    if (!isServiceItem && product.batchTracking && !batchNo) throw new Error(`${product.code} requires Batch No.`);
    if (!isServiceItem && product.serialNumberTracking) {
      if (serialNos.length === 0) throw new Error(`${product.code} requires S/N No.`);
      if (toNumber(qty) !== serialNos.length) throw new Error(`${product.code} quantity must match selected S/N count.`);
    }
    const claimAmount = isServiceItem ? decimalWithPlaces(line.claimAmount ?? line.unitPrice, numberFormat.priceDecimalPlaces, Number(product.sellingPrice ?? 0)) : null;
    const unitPrice = isServiceItem ? claimAmount! : decimalWithPlaces(line.unitPrice, numberFormat.priceDecimalPlaces, Number(product.sellingPrice ?? 0));
    const discountType = String(line.discountType || "PERCENT").toUpperCase() === "AMOUNT" ? "AMOUNT" : "PERCENT";
    const discountRate = discountType === "PERCENT" ? basicDecimal(line.discountRate, 0) : new Prisma.Decimal(0);
    const rawDiscountValue = basicDecimal(line.discountRate, 0);
    const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
    const discountAmount = discountType === "AMOUNT" ? Prisma.Decimal.min(rawDiscountValue, lineSubtotal).toDecimalPlaces(2) : lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
    const lineTotal = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

    return {
      lineNo,
      inventoryProductId: product.id,
      productCode: product.code,
      productDescription: normalizeText(line.productDescription) || product.description,
      itemType: product.itemType,
      claimAmount,
      uom: (normalizeText(line.uom) || product.baseUom || "UNIT").toUpperCase(),
      qty,
      unitPrice,
      discountRate,
      discountType,
      discountAmount,
      locationId: location?.id || null,
      batchNo,
      serialNos,
      batchTracking: !isServiceItem && Boolean(product.batchTracking),
      serialNumberTracking: !isServiceItem && Boolean(product.serialNumberTracking),
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
      lineTotal,
      remarks: normalizeText(line.remarks),
    };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxTotal = new Prisma.Decimal(0);
  const grandTotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

  return {
    docDate,
    customer,
    currency: normalizeText(body.currency) || customer.currency || "MYR",
    reference: normalizeText(body.reference),
    remarks: normalizeText(body.remarks),
    projectId: normalizeText(body.projectId),
    departmentId: normalizeText(body.departmentId),
    termsAndConditions: normalizeText(body.termsAndConditions),
    bankAccount: normalizeText(body.bankAccount),
    footerRemarks: normalizeText(body.footerRemarks),
    subtotal,
    discountTotal,
    taxableSubtotal: subtotal.minus(discountTotal).toDecimalPlaces(2),
    taxTotal,
    grandTotal,
    lines,
  };
}

async function createStockIssueForDirectSalesInvoice(tx: Prisma.TransactionClient, adminId: string, salesInvoice: any, lines: Array<any>, body: any) {
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

function buildSalesUpdateData(data: Awaited<ReturnType<typeof buildDirectSalesInvoiceData>>, body: any, adminId: string) {
  return {
    docDate: data.docDate,
    docDesc: normalizeText(body.docDesc),
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
    createdByAdminId: adminId,
  };
}

function buildLineCreateData(lines: Array<any>) {
  return lines.map((line) => ({
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
  }));
}

async function reverseStockIssueForSalesInvoice(tx: Prisma.TransactionClient, salesInvoice: any, adminId: string, cancelReason: string | null) {
  const ledgerEntries = await tx.stockLedger.findMany({
    where: {
      sourceType: "SALES_INVOICE",
      sourceId: salesInvoice.id,
      movementDirection: "OUT",
    },
    orderBy: { createdAt: "asc" },
  });

  if (ledgerEntries.length === 0) {
    await reverseLegacyStockIssueForSalesInvoice(tx, salesInvoice, adminId, cancelReason);
    return;
  }

  const latestReversal = await tx.stockLedger.findFirst({
    where: {
      sourceType: "SALES_INVOICE_CANCEL",
      sourceId: salesInvoice.id,
      movementDirection: "IN",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const activeLedgerEntries = latestReversal
    ? ledgerEntries.filter((entry) => entry.createdAt > latestReversal.createdAt)
    : ledgerEntries;

  if (activeLedgerEntries.length === 0) return;

  await acquireStockMutationLocks(
    tx,
    activeLedgerEntries.map((entry) => {
      const serialMatch = String(entry.remarks || "").match(/SERIAL_NO=([^|]+)/);
      return {
        inventoryProductId: entry.inventoryProductId,
        batchNo: entry.batchNo,
        serialNos: serialMatch?.[1] ? [serialMatch[1].trim()] : [],
        locationId: entry.locationId,
      };
    })
  );

  for (const entry of activeLedgerEntries) {
    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(entry.qty), "IN");
    await tx.stockLedger.create({
      data: {
        movementDate: new Date(),
        movementType: "SI",
        movementDirection: "IN",
        ...ledgerValues,
        batchNo: entry.batchNo,
        inventoryProductId: entry.inventoryProductId,
        locationId: entry.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: salesInvoice.docNo,
        referenceText: `Cancel Sales Invoice ${salesInvoice.docNo}`,
        sourceType: "SALES_INVOICE_CANCEL",
        sourceId: salesInvoice.id,
        remarks: [cancelReason || `Cancellation reversal for ${salesInvoice.docNo}`, `REVERSAL_OF_LEDGER_ID=${entry.id}`].filter(Boolean).join(" | "),
      },
    });

    const serialMatch = String(entry.remarks || "").match(/SERIAL_NO=([^|]+)/);
    const serialNo = serialMatch?.[1]?.trim();
    if (serialNo) {
      const serial = await tx.inventorySerial.findUnique({
        where: {
          inventoryProductId_serialNo: {
            inventoryProductId: entry.inventoryProductId,
            serialNo,
          },
        },
      });
      if (!serial) throw new Error(`Serial No ${serialNo} cannot be found for cancellation.`);
      if (serial.status !== "OUT_OF_STOCK") throw new Error(`Serial No ${serialNo} cannot be restored because it is not in outbound state.`);
      await tx.inventorySerial.update({
        where: { id: serial.id },
        data: { status: "IN_STOCK", currentLocationId: entry.locationId },
      });
    }
  }
}

async function reverseLegacyStockIssueForSalesInvoice(tx: Prisma.TransactionClient, salesInvoice: any, adminId: string, cancelReason: string | null) {
  const stockTransaction = await tx.stockTransaction.findFirst({
    where: {
      transactionType: "SI",
      reference: salesInvoice.docNo,
      status: { not: "CANCELLED" },
    },
    include: { lines: { include: { serialEntries: true } } },
  });

  if (!stockTransaction) return;

  await acquireAdvisoryLock(tx, buildTransactionEntityLockKey(stockTransaction.id));
  await acquireStockMutationLocks(
    tx,
    stockTransaction.lines.map((line) => ({
      inventoryProductId: line.inventoryProductId,
      batchNo: line.batchNo,
      serialNos: line.serialEntries.map((serialEntry) => serialEntry.serialNo),
      locationId: line.locationId,
      fromLocationId: line.fromLocationId,
      toLocationId: line.toLocationId,
    }))
  );

  for (const line of stockTransaction.lines) {
    const qty = createStoredQtyDecimal(roundQty(line.qty));
    const ledgerValues = buildLedgerValues(qty, "IN");
    await tx.stockLedger.create({
      data: {
        movementDate: new Date(),
        movementType: "SI",
        movementDirection: "IN",
        ...ledgerValues,
        batchNo: line.batchNo,
        inventoryProductId: line.inventoryProductId,
        locationId: line.locationId!,
        transactionId: stockTransaction.id,
        transactionLineId: line.id,
        referenceNo: stockTransaction.transactionNo,
        referenceText: `Cancel Sales Invoice ${salesInvoice.docNo}`,
        sourceType: "SALES_INVOICE_CANCEL",
        sourceId: salesInvoice.id,
        remarks: cancelReason || `Cancellation reversal for ${salesInvoice.docNo}`,
      },
    });

    for (const serialEntry of line.serialEntries || []) {
      const serial = serialEntry.inventorySerialId
        ? await tx.inventorySerial.findUnique({ where: { id: serialEntry.inventorySerialId } })
        : await tx.inventorySerial.findUnique({
            where: { inventoryProductId_serialNo: { inventoryProductId: line.inventoryProductId, serialNo: serialEntry.serialNo } },
          });
      if (!serial) throw new Error(`Serial No ${serialEntry.serialNo} cannot be found for DO cancellation.`);
      if (serial.status !== "OUT_OF_STOCK") throw new Error(`Serial No ${serialEntry.serialNo} cannot be restored because it is not in outbound state.`);
      await tx.inventorySerial.update({
        where: { id: serial.id },
        data: { status: "IN_STOCK", currentLocationId: line.locationId!, inventoryBatchId: serialEntry.inventoryBatchId ?? serial.inventoryBatchId },
      });
    }
  }

  await tx.stockTransaction.update({
    where: { id: stockTransaction.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByAdminId: adminId,
      cancelReason,
    },
  });
}

export async function GET(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const transaction = await db.salesTransaction.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, customerAccountNo: true } },
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, code: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true, projectId: true } },
        revisedFrom: { select: { id: true, docNo: true } },
        revisions: { select: { id: true, docNo: true, status: true } },
        sourceLinks: {
          include: {
            sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
          },
        },
        targetLinks: {
          include: {
            sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
          },
        },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            inventoryProduct: { select: { itemType: true } },
            sourceLineLinks: {
              include: {
                sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
                sourceLine: { select: { id: true, lineNo: true, qty: true } },
              },
            },
            targetLineLinks: {
              include: {
                targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
              },
            },
          },
        },
      },
    });

    if (!transaction || transaction.docType !== "INV") {
      return NextResponse.json({ ok: false, error: "Sales Invoice not found." }, { status: 404 });
    }

    const stockIssue = await db.stockTransaction.findFirst({
      where: { transactionType: "SI", reference: transaction.docNo, status: { not: "CANCELLED" } },
      include: { lines: { orderBy: { createdAt: "asc" }, include: { serialEntries: { orderBy: { serialNo: "asc" } } } } },
    });

    const sourceDeliveryOrderIds = Array.from(new Set(
      (transaction.targetLinks || [])
        .map((link) => link.sourceTransaction)
        .filter((source) => source?.docType === "DO" && source.status !== "CANCELLED")
        .map((source) => source!.id)
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

    const transactionWithStockPicking = {
      ...withPaymentSummary(withCancellationDetails(transaction)),
      lines: transaction.lines.map((line, index) => {
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
    };

    return NextResponse.json({ ok: true, transaction: transactionWithStockPicking });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load sales invoice." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const cancelReason = typeof body.cancelReason === "string" ? body.cancelReason.trim() || null : null;

    if (!["cancel", "edit", "revise"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Invalid Sales Invoice action." }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, `sales-transaction:${id}`);

      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          revisedFrom: { select: { id: true, docNo: true } },
          lines: true,
          payments: true,
          sourceLinks: {
            include: {
              targetTransaction: { select: { id: true, docType: true, status: true } },
            },
          },
          targetLinks: {
            include: {
              sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
            },
          },
        },
      });

      if (!current || current.docType !== "INV") throw new Error("Sales Invoice not found.");
      if (current.status === "CANCELLED") throw new Error("This Sales Invoice is already cancelled.");

      const hasActiveInvoice = current.sourceLinks.some(
        (link) => ["INV", "CS"].includes(String(link.targetTransaction?.docType || "")) && link.targetTransaction?.status !== "CANCELLED"
      );
      if (hasActiveInvoice) throw new Error("This Sales Invoice has been generated to an active invoice. Cancel the invoice first.");

      if (action === "cancel") {
        await reverseStockIssueForSalesInvoice(tx, current, admin.id, cancelReason);

        const updated = await tx.salesTransaction.update({
          where: { id },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByAdminId: admin.id, cancelReason },
          include: { cancelledByAdmin: { select: { id: true, name: true, email: true } }, lines: true },
        });

        const sourceTransactionIds = current.targetLinks.map((link) => link.sourceTransaction?.id).filter(Boolean) as string[];
        await refreshSalesOrderStatuses(tx, sourceTransactionIds);
        await refreshDeliveryOrderStatuses(tx, sourceTransactionIds);
        return { transaction: updated, auditAction: "CANCEL" as const, description: `Cancelled Sales Invoice ${updated.docNo}.` };
      }

      const paymentInput = getPaymentInput(body);
      const isGeneratedFromSource = hasSalesOrderSource(current);

      if (isGeneratedFromSource) {
        if (action !== "edit") {
          throw new Error("Sales Invoice generated from source document cannot be revised. Please cancel this Sales Invoice and generate a new Sales Invoice from the original source document.");
        }

        const existingTotalPaid = (current.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0);
        validatePaymentAmount(paymentInput.amount, current.grandTotal, existingTotalPaid);
        await createSalesTransactionPaymentIfNeeded(tx, current.id, admin.id, paymentInput);

        const nextTotalPaid = Math.round((existingTotalPaid + paymentInput.amount + Number.EPSILON) * 100) / 100;
        const updated = await tx.salesTransaction.update({
          where: { id: current.id },
          data: { status: getSalesInvoiceStatusForPayment(current.grandTotal, nextTotalPaid) },
          include: {
            lines: true,
            payments: {
              orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
              include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
            },
          },
        });

        return { transaction: updated, auditAction: "UPDATE" as const, description: `Recorded payment for Sales Invoice ${updated.docNo}.` };
      }

      const data = await buildDirectSalesInvoiceData(body, tx);
      await reverseStockIssueForSalesInvoice(tx, current, admin.id, action === "revise" ? "Revised Sales Invoice" : "Edited Sales Invoice");

      if (action === "edit") {
        await tx.salesTransactionLine.deleteMany({ where: { transactionId: current.id } });
        const updated = await tx.salesTransaction.update({
          where: { id: current.id },
          data: {
            ...buildSalesUpdateData(data, body, admin.id),
            docNo: current.docNo,
            status: getSalesInvoiceStatusForPayment(data.grandTotal, Math.round(((current.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0) + paymentInput.amount + Number.EPSILON) * 100) / 100),
            cancelledAt: null,
            cancelledByAdminId: null,
            cancelReason: null,
            lines: { create: buildLineCreateData(data.lines) },
          },
          include: { lines: true, payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } },
        });

        const existingTotalPaid = (current.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0);
        validatePaymentAmount(paymentInput.amount, data.grandTotal, existingTotalPaid);
        await createStockIssueForDirectSalesInvoice(tx, admin.id, updated, data.lines, body);
        await createSalesTransactionPaymentIfNeeded(tx, updated.id, admin.id, paymentInput);
        const withPayments = await tx.salesTransaction.findUnique({ where: { id: updated.id }, include: { lines: true, payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } } });
        return { transaction: withPayments || updated, auditAction: "UPDATE" as const, description: `Updated Sales Invoice ${updated.docNo}.` };
      }

      const nextDocNo = await generateSalesInvoiceRevisionNo(tx, current);
      const revised = await tx.salesTransaction.create({
        data: {
          docType: "INV",
          docNo: nextDocNo,
          status: getSalesInvoiceStatusForPayment(data.grandTotal, paymentInput.amount),
          revisedFromId: current.revisedFromId || current.id,
          ...buildSalesUpdateData(data, body, admin.id),
          lines: { create: buildLineCreateData(data.lines) },
        },
        include: { lines: true, payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } },
      });

      await tx.salesTransaction.update({
        where: { id: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByAdminId: admin.id, cancelReason: "Revised Sales Invoice" },
      });

      validatePaymentAmount(paymentInput.amount, data.grandTotal, 0);
      await createStockIssueForDirectSalesInvoice(tx, admin.id, revised, data.lines, body);
      await createSalesTransactionPaymentIfNeeded(tx, revised.id, admin.id, paymentInput);
      const revisedWithPayments = await tx.salesTransaction.findUnique({ where: { id: revised.id }, include: { lines: true, payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } } });
      return { transaction: revisedWithPayments || revised, auditAction: "REVISE" as const, description: `Revised Sales Invoice ${current.docNo} to ${revised.docNo}.` };
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: result.auditAction,
      entityType: "SALES_INVOICE",
      entityId: result.transaction.id,
      description: result.description,
    });

    return NextResponse.json({ ok: true, transaction: withPaymentSummary(withCancellationDetails(result.transaction)) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update sales invoice." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
