
import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
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

type DebitNoteLinePayload = {
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
  uom?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
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

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function decimal(value: Prisma.Decimal | number | string | null | undefined, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(2));
}

function qtyDecimal(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Debit quantity must be greater than zero.");
  return new Prisma.Decimal(numeric.toFixed(3));
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

function calculateTaxAmount(taxableAmount: Prisma.Decimal, taxRate: Prisma.Decimal | number | string | null | undefined, method: string | null | undefined) {
  const rate = new Prisma.Decimal(Number(taxRate ?? 0));
  if (rate.lte(0) || taxableAmount.lte(0)) return new Prisma.Decimal(0);
  if (method === "INCLUSIVE") return taxableAmount.mul(rate).div(new Prisma.Decimal(100).plus(rate)).toDecimalPlaces(2);
  return taxableAmount.mul(rate).div(100).toDecimalPlaces(2);
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
  if (!year || !month || !day) throw new Error("Unable to generate debit note date prefix.");
  return { year, month, day };
}

function buildSalesDocumentNumberLockKey(docType: string, documentDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(documentDate);
  return `sales-docno:${docType}:${year}${month}${day}`;
}

async function generateDebitNoteNo(tx: Prisma.TransactionClient, docDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(docDate);
  const prefix = `DN-${year}${month}${day}`;
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`);

  const existing = await tx.salesTransaction.findMany({
    where: { docType: "DN", docNo: { startsWith: `${prefix}-` } },
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
  if (docNo.length > 30) {
    throw new Error("Manual Document No must not exceed 30 characters.");
  }
  return docNo;
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

function calculateSalesAdjustmentSummary(
  sourceLinks?: Array<{ targetTransaction?: { status?: string | null; docType?: string | null; grandTotal?: Prisma.Decimal | number | string | null } | null }>
) {
  const linkedCreditNotes = (sourceLinks || [])
    .filter((link) => link.targetTransaction?.docType === "CN")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.targetTransaction?.grandTotal), 0);

  const linkedDebitNotes = (sourceLinks || [])
    .filter((link) => link.targetTransaction?.docType === "DN")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.targetTransaction?.grandTotal), 0);

  return {
    totalCredited: Math.round((linkedCreditNotes + Number.EPSILON) * 100) / 100,
    totalDebited: Math.round((linkedDebitNotes + Number.EPSILON) * 100) / 100,
  };
}

type InvoiceOutstandingInput = {
  grandTotal?: Prisma.Decimal | number | string | null;
  payments?: Array<{ amount?: Prisma.Decimal | number | string | null }> | null;
  sourceLinks?: Array<{
    targetTransaction?: {
      status?: string | null;
      docType?: string | null;
      grandTotal?: Prisma.Decimal | number | string | null;
    } | null;
  }> | null;
};

function calculateInvoiceOutstanding(invoice: InvoiceOutstandingInput) {
  const payments: Array<{ amount?: Prisma.Decimal | number | string | null }> = Array.isArray(invoice.payments) ? invoice.payments : [];
  const totalPaid = payments.reduce((sum: number, payment: { amount?: Prisma.Decimal | number | string | null }) => sum + toNumber(payment.amount), 0);
  const summary = calculateSalesAdjustmentSummary(invoice.sourceLinks || []);
  const adjustedTotal = Math.max(0, Math.round((toNumber(invoice.grandTotal) - summary.totalCredited + summary.totalDebited + Number.EPSILON) * 100) / 100);
  const outstanding = Math.max(0, Math.round((adjustedTotal - totalPaid + Number.EPSILON) * 100) / 100);
  return { totalPaid, adjustedTotal, outstanding };
}

async function getSourceInvoices(tx: Prisma.TransactionClient) {
  const invoices = await tx.salesTransaction.findMany({
    where: { docType: "INV", status: { not: "CANCELLED" }, customer: { isActive: true } },
    orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
    include: {
      payments: true,
      sourceLinks: {
        include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } },
      },
    },
  });

  return invoices
    .map((invoice) => {
      const balance = calculateInvoiceOutstanding(invoice);
      return {
        ...invoice,
        totalPaid: balance.totalPaid,
        adjustedGrandTotal: balance.adjustedTotal,
        outstandingBalance: balance.outstanding,
      };
    })
    .filter((invoice) => Number(invoice.outstandingBalance || 0) > 0);
}

async function buildDebitNoteData(body: any, tx: Prisma.TransactionClient) {
  const docDate = normalizeDate(body.docDate);
  const sourceInvoiceId = normalizeText(body.sourceTransactionId);
  if (!sourceInvoiceId) throw new Error("Source Sales Invoice is required.");

  const reason = normalizeText(body.reason) || normalizeText(body.remarks);
  if (!reason) throw new Error("Debit Note reason is required.");

  const sourceInvoice = await tx.salesTransaction.findUnique({
    where: { id: sourceInvoiceId },
    include: {
      customer: true,
      payments: true,
      sourceLinks: {
        include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } },
      },
    },
  });

  if (!sourceInvoice || sourceInvoice.docType !== "INV") throw new Error("Selected Sales Invoice is invalid.");
  if (sourceInvoice.status === "CANCELLED") throw new Error("Cancelled Sales Invoice cannot be debited.");
  if (sourceInvoice.customer && !sourceInvoice.customer.isActive) throw new Error("Inactive customer cannot be used for Sales transactions.");

  const balance = calculateInvoiceOutstanding(sourceInvoice);
  if (balance.outstanding <= 0) throw new Error("Fully paid Sales Invoice cannot be debited.");

  const rawLines = Array.isArray(body.lines) ? (body.lines as DebitNoteLinePayload[]) : [];
  if (rawLines.length === 0) throw new Error("Please add at least one Debit Note line.");

  const productIds = rawLines.map((line) => normalizeText(line.inventoryProductId)).filter(Boolean) as string[];
  const products = await tx.inventoryProduct.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: { uomConversions: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const taxSettings = await loadTaxSettings(tx);
  const lines = rawLines.map((rawLine, index) => {
    const productId = normalizeText(rawLine.inventoryProductId);
    if (!productId) throw new Error("Product is required.");
    const product = productMap.get(productId);
    if (!product) throw new Error("Selected product is invalid.");

    const qty = qtyDecimal(rawLine.qty);
    const unitPrice = decimal(rawLine.unitPrice ?? product.sellingPrice);
    const discountRate = decimal(rawLine.discountRate);
    const discountType = rawLine.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT";
    const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
    const discountAmount = discountType === "AMOUNT"
      ? (discountRate.gt(lineSubtotal) ? lineSubtotal : discountRate).toDecimalPlaces(2)
      : lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
    const taxableAmount = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

    const requestedTaxCodeId = normalizeText(rawLine.taxCodeId);
    const taxCode = requestedTaxCodeId ? taxSettings.taxCodes.get(requestedTaxCodeId) : null;
    const taxRate = taxSettings.enabled && taxCode ? decimal(taxCode.rate) : new Prisma.Decimal(0);
    const taxAmount = taxSettings.enabled && taxCode ? calculateTaxAmount(taxableAmount, taxRate, taxCode.calculationMethod) : new Prisma.Decimal(0);
    const lineTotal = taxSettings.enabled && taxCode?.calculationMethod !== "INCLUSIVE" ? taxableAmount.plus(taxAmount).toDecimalPlaces(2) : taxableAmount.toDecimalPlaces(2);
    const locationId = normalizeText(rawLine.locationId);
    const location = locationId ? null : null;
    const itemType = product.itemType;
    const isStockOut = itemType === "STOCK_ITEM" && product.trackInventory;
    if (isStockOut && !locationId) throw new Error(`${product.code} location is required.`);
    if (isStockOut && product.batchTracking && !normalizeText(rawLine.batchNo)) throw new Error(`${product.code} Batch No is required.`);

    const serialNos = normalizeSerialNumbers(rawLine.serialNos);
    if (isStockOut && product.serialNumberTracking && serialNos.length !== toNumber(qty)) {
      throw new Error(`${product.code} selected Serial No count must match quantity.`);
    }

    return {
      lineNo: index + 1,
      inventoryProductId: product.id,
      productCode: normalizeText(rawLine.productCode) || product.code,
      productDescription: normalizeText(rawLine.productDescription) || product.description,
      itemType,
      trackInventory: product.trackInventory,
      batchTracking: product.batchTracking,
      serialNumberTracking: product.serialNumberTracking,
      uom: normalizeText(rawLine.uom) || product.baseUom,
      qty,
      unitPrice,
      discountRate,
      discountType,
      discountAmount,
      locationId,
      locationCode: null as string | null,
      locationName: null as string | null,
      batchNo: normalizeText(rawLine.batchNo),
      serialNos,
      taxCodeId: taxCode?.id || null,
      taxCode: taxCode?.code || null,
      taxDescription: taxCode?.description || null,
      taxDisplayLabel: taxCode ? `${taxCode.code} (${Number(taxCode.rate || 0)}%)` : null,
      taxRate,
      taxCalculationMethod: taxCode?.calculationMethod || null,
      taxAmount,
      lineSubtotal,
      lineTotal,
      remarks: normalizeText(rawLine.remarks),
    };
  });

  if (lines.length === 0) throw new Error("Please add at least one Debit Note line.");

  const locationIds = Array.from(new Set(lines.map((line) => line.locationId).filter(Boolean))) as string[];
  const locations = locationIds.length
    ? await tx.stockLocation.findMany({ where: { id: { in: locationIds }, isActive: true }, select: { id: true, code: true, name: true } })
    : [];
  const locationMap = new Map(locations.map((location) => [location.id, location]));
  for (const line of lines) {
    if (line.locationId) {
      const location = locationMap.get(line.locationId);
      if (!location) throw new Error(`${line.productCode} location is invalid.`);
      line.locationCode = location.code;
      line.locationName = location.name;
    }
  }

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxableSubtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal.minus(line.discountAmount)), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const grandTotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

  return {
    sourceInvoice,
    reason,
    docDate,
    requestedDocNo: assertValidManualDocNo(body.docNo),
    docDesc: `Debit Note for ${sourceInvoice.docNo}`,
    customerId: sourceInvoice.customerId,
    customerAccountNo: sourceInvoice.customerAccountNo,
    customerName: sourceInvoice.customerName,
    billingAddressLine1: sourceInvoice.billingAddressLine1,
    billingAddressLine2: sourceInvoice.billingAddressLine2,
    billingAddressLine3: sourceInvoice.billingAddressLine3,
    billingAddressLine4: sourceInvoice.billingAddressLine4,
    billingCity: sourceInvoice.billingCity,
    billingPostCode: sourceInvoice.billingPostCode,
    billingCountryCode: sourceInvoice.billingCountryCode,
    deliveryAddressLine1: sourceInvoice.deliveryAddressLine1,
    deliveryAddressLine2: sourceInvoice.deliveryAddressLine2,
    deliveryAddressLine3: sourceInvoice.deliveryAddressLine3,
    deliveryAddressLine4: sourceInvoice.deliveryAddressLine4,
    deliveryCity: sourceInvoice.deliveryCity,
    deliveryPostCode: sourceInvoice.deliveryPostCode,
    deliveryCountryCode: sourceInvoice.deliveryCountryCode,
    attention: sourceInvoice.attention,
    contactNo: sourceInvoice.contactNo,
    email: sourceInvoice.email,
    currency: sourceInvoice.currency,
    reference: sourceInvoice.docNo,
    remarks: normalizeText(body.remarks),
    agentId: normalizeText(body.agentId) || sourceInvoice.agentId || null,
    projectId: normalizeText(body.projectId) || sourceInvoice.projectId || null,
    departmentId: normalizeText(body.departmentId) || sourceInvoice.departmentId || null,
    footerRemarks: normalizeText(body.footerRemarks),
    subtotal,
    discountTotal,
    taxableSubtotal,
    taxTotal,
    grandTotal,
    taxCalculationModeSnapshot: taxSettings.mode,
    isTaxEnabledSnapshot: taxSettings.enabled,
    lines,
  };
}

async function createDebitNoteStockOut(tx: Prisma.TransactionClient, debitNote: any, lines: Array<any>) {
  const stockLines = lines.filter((line) => line.itemType === "STOCK_ITEM" && line.trackInventory);
  if (stockLines.length === 0) return;

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
    const baseRemarks = line.remarks || debitNote.remarks || `Debit stock out for ${debitNote.docNo}`;

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
            movementDate: debitNote.docDate,
            movementType: "SI",
            movementDirection: "OUT",
            ...ledgerValues,
            batchNo: line.batchNo || serialRecord.inventoryBatch?.batchNo || null,
            inventoryProductId: line.inventoryProductId!,
            locationId: line.locationId,
            transactionId: null,
            transactionLineId: null,
            referenceNo: debitNote.docNo,
            referenceText: `Debit Note ${debitNote.docNo}`,
            sourceType: "DEBIT_NOTE",
            sourceId: debitNote.id,
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
        movementDate: debitNote.docDate,
        movementType: "SI",
        movementDirection: "OUT",
        ...ledgerValues,
        batchNo: line.batchNo,
        inventoryProductId: line.inventoryProductId!,
        locationId: line.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: debitNote.docNo,
        referenceText: `Debit Note ${debitNote.docNo}`,
        sourceType: "DEBIT_NOTE",
        sourceId: debitNote.id,
        remarks: baseRemarks,
      },
    });
  }
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("nextDocNo") === "1") {
      const docDate = normalizeDate(searchParams.get("docDate"));
      const docNo = await db.$transaction(async (tx) => {
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("DN", docDate));
        return generateDebitNoteNo(tx, docDate);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    if (searchParams.get("sourceInvoices") === "1") {
      const invoices = await db.$transaction(async (tx) => getSourceInvoices(tx));
      return NextResponse.json({ ok: true, invoices });
    }

    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";
    const pageSize = 10;
    const requestedPage = Number(searchParams.get("page") || "1");
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

    const where: Prisma.SalesTransactionWhereInput = {
        docType: "DN",
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
      };

    const total = await db.salesTransaction.count({ where });

    const rows = await db.salesTransaction.findMany({
      where,
      orderBy: [{ docNo: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    const pagination = {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };

    return NextResponse.json({
      ok: true,
      transactions: rows.map((row) => ({
        ...withCancellationDetails(row),
        sourceLinks: row.targetLinks.map((link) => ({ sourceTransaction: link.sourceTransaction })),
      })),
      pagination,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load debit notes." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const created = await db.$transaction(async (tx) => {
      const data = await buildDebitNoteData(body, tx);
      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("DN", data.docDate));

      const docNo = data.requestedDocNo || (await generateDebitNoteNo(tx, data.docDate));
      if (data.requestedDocNo) {
        const exists = await tx.salesTransaction.findUnique({ where: { docNo: data.requestedDocNo }, select: { id: true } });
        if (exists) throw new Error("Debit Note No already exists.");
      }

      const debitNote = await tx.salesTransaction.create({
        data: {
          docType: "DN",
          docNo,
          docDate: data.docDate,
          docDesc: data.docDesc,
          status: "COMPLETED",
          customerId: data.customerId,
          customerAccountNo: data.customerAccountNo,
          customerName: data.customerName,
          billingAddressLine1: data.billingAddressLine1,
          billingAddressLine2: data.billingAddressLine2,
          billingAddressLine3: data.billingAddressLine3,
          billingAddressLine4: data.billingAddressLine4,
          billingCity: data.billingCity,
          billingPostCode: data.billingPostCode,
          billingCountryCode: data.billingCountryCode,
          deliveryAddressLine1: data.deliveryAddressLine1,
          deliveryAddressLine2: data.deliveryAddressLine2,
          deliveryAddressLine3: data.deliveryAddressLine3,
          deliveryAddressLine4: data.deliveryAddressLine4,
          deliveryCity: data.deliveryCity,
          deliveryPostCode: data.deliveryPostCode,
          deliveryCountryCode: data.deliveryCountryCode,
          attention: data.attention,
          contactNo: data.contactNo,
          email: data.email,
          currency: data.currency,
          reference: data.reference,
          reason: data.reason,
          remarks: data.remarks,
          agentId: data.agentId,
          projectId: data.projectId,
          departmentId: data.departmentId,
          subtotal: data.subtotal,
          discountTotal: data.discountTotal,
          taxableSubtotal: data.taxableSubtotal,
          taxCalculationModeSnapshot: data.taxCalculationModeSnapshot as any,
          isTaxEnabledSnapshot: data.isTaxEnabledSnapshot,
          taxTotal: data.taxTotal,
          grandTotal: data.grandTotal,
          footerRemarks: data.footerRemarks,
          createdByAdminId: admin.id,
        },
      });

      const createdLines = [];
      for (const line of data.lines) {
        const createdLine = await tx.salesTransactionLine.create({
          data: {
            transactionId: debitNote.id,
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
          },
        });
        createdLines.push({ ...line, id: createdLine.id });
      }

      await tx.salesTransactionLink.create({
        data: {
          sourceTransactionId: data.sourceInvoice.id,
          targetTransactionId: debitNote.id,
          linkType: "GENERATED_TO",
        },
      });

      await createDebitNoteStockOut(tx, debitNote, createdLines);

      await createAuditLogFromRequest({
        req,
        user: admin,
        module: "SALES",
        action: "CREATE",
        entityType: "DEBIT_NOTE",
        entityId: debitNote.id,
        description: `Created Debit Note ${debitNote.docNo} from ${data.sourceInvoice.docNo}`,
      });

      return tx.salesTransaction.findUnique({
        where: { id: debitNote.id },
        include: {
          createdByAdmin: { select: { id: true, name: true, email: true } },
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      });
    });

    return NextResponse.json({ ok: true, transaction: created ? withCancellationDetails(created) : null });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create debit note." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
