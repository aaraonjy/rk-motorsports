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
} from "@/lib/stock";

type CreditNoteLinePayload = {
  sourceLineId?: string | null;
  sourceTransactionId?: string | null;
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
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
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Credit quantity must be greater than zero.");
  return new Prisma.Decimal(numeric.toFixed(3));
}

function sanitizeMoney(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return new Prisma.Decimal(0);
  return new Prisma.Decimal(numeric.toFixed(2));
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
  if (!year || !month || !day) throw new Error("Unable to generate credit note date prefix.");
  return { year, month, day };
}

function buildSalesDocumentNumberLockKey(docType: string, documentDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(documentDate);
  return `sales-docno:${docType}:${year}${month}${day}`;
}

async function generateCreditNoteNo(tx: Prisma.TransactionClient, docDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(docDate);
  const prefix = `CN-${year}${month}${day}`;
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`);

  const existing = await tx.salesTransaction.findMany({
    where: { docType: "CN", docNo: { startsWith: `${prefix}-` } },
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
  if (!/^CN-\d{8}-\d{4}$/.test(docNo)) {
    throw new Error("Credit Note No must use CN-YYYYMMDD-0001 format.");
  }
  return docNo;
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

function sumCreditedQty(line: {
  sourceLineLinks?: Array<{ linkType?: string | null; qty?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
}) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === "CREDITED_TO")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}

function sumCreditedAmount(line: {
  sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
}) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === "CREDITED_TO")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
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

async function getSourceInvoices(tx: Prisma.TransactionClient) {
  const invoices = await tx.salesTransaction.findMany({
    where: { docType: "INV", status: { not: "CANCELLED" } },
    orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
    include: {
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          inventoryProduct: { select: { itemType: true, trackInventory: true, batchTracking: true, serialNumberTracking: true } },
          sourceLineLinks: {
            include: { targetTransaction: { select: { id: true, status: true } } },
          },
        },
      },
    },
  });

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const ledgerRows = invoiceIds.length > 0
    ? await tx.stockLedger.findMany({
        where: { sourceType: "SALES_INVOICE", sourceId: { in: invoiceIds }, movementDirection: "OUT" },
        select: { sourceId: true, inventoryProductId: true, locationId: true, batchNo: true, remarks: true },
      })
    : [];

  const stockMetaByInvoiceProduct = new Map<string, { batchNos: Set<string>; serialNos: Set<string> }>();
  for (const row of ledgerRows) {
    const key = `${row.sourceId || ""}__${row.inventoryProductId || ""}__${row.locationId || ""}`;
    const current = stockMetaByInvoiceProduct.get(key) || { batchNos: new Set<string>(), serialNos: new Set<string>() };
    if (row.batchNo) current.batchNos.add(row.batchNo);
    const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
    if (serialMatch?.[1]) current.serialNos.add(serialMatch[1].trim());
    stockMetaByInvoiceProduct.set(key, current);
  }

  return invoices
    .map((invoice) => ({
      ...invoice,
      lines: invoice.lines.map((line) => {
        const creditedQty = sumCreditedQty(line as any);
        const creditedAmount = sumCreditedAmount(line as any);
        const qty = toNumber(line.qty);
        const lineTotal = toNumber(line.lineTotal);
        const stockMeta = stockMetaByInvoiceProduct.get(`${invoice.id}__${line.inventoryProductId || ""}__${line.locationId || ""}`);
        const batchNos = stockMeta ? Array.from(stockMeta.batchNos) : [];
        const serialNos = stockMeta ? Array.from(stockMeta.serialNos) : [];
        return {
          ...line,
          itemType: line.inventoryProduct?.itemType || "STOCK_ITEM",
          batchNo: batchNos.join(", "),
          serialNos,
          creditedQty,
          creditedAmount,
          remainingCreditQty: Math.max(0, qty - creditedQty),
          remainingCreditAmount: Math.max(0, lineTotal - creditedAmount),
        };
      }),
    }))
    .filter((invoice) =>
      invoice.lines.some((line: any) =>
        line.itemType === "SERVICE_ITEM"
          ? Number(line.remainingCreditAmount || 0) > 0
          : Number(line.remainingCreditQty || 0) > 0
      )
    );
}

async function buildCreditNoteData(body: any, tx: Prisma.TransactionClient) {
  const docDate = normalizeDate(body.docDate);
  const sourceInvoiceId = normalizeText(body.sourceTransactionId);
  if (!sourceInvoiceId) throw new Error("Source Sales Invoice is required.");

  const reason = normalizeText(body.reason) || normalizeText(body.remarks);
  if (!reason) throw new Error("Credit Note reason is required.");

  const sourceInvoice = await tx.salesTransaction.findUnique({
    where: { id: sourceInvoiceId },
    include: {
      customer: true,
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          inventoryProduct: { select: { id: true, itemType: true, trackInventory: true, batchTracking: true, serialNumberTracking: true } },
          sourceLineLinks: {
            include: { targetTransaction: { select: { id: true, status: true } } },
          },
        },
      },
    },
  });

  if (!sourceInvoice || sourceInvoice.docType !== "INV") throw new Error("Selected Sales Invoice is invalid.");
  if (sourceInvoice.status === "CANCELLED") throw new Error("Cancelled Sales Invoice cannot be credited.");

  const sourceLines = new Map(sourceInvoice.lines.map((line) => [line.id, line]));
  const rawLines = Array.isArray(body.lines) ? (body.lines as CreditNoteLinePayload[]) : [];
  if (rawLines.length === 0) throw new Error("Please select at least one invoice line to credit.");

  const taxSettings = await loadTaxSettings(tx);
  const lines = rawLines.map((rawLine, index) => {
    const sourceLineId = normalizeText(rawLine.sourceLineId);
    if (!sourceLineId) throw new Error("Source invoice line is required.");

    const sourceLine = sourceLines.get(sourceLineId);
    if (!sourceLine) throw new Error("Selected invoice line is invalid.");

    const itemType = sourceLine.inventoryProduct?.itemType || "STOCK_ITEM";
    const qty = qtyDecimal(rawLine.qty);
    const creditQty = toNumber(qty);
    const creditedQty = sumCreditedQty(sourceLine as any);
    const remainingCreditQty = Math.max(0, toNumber(sourceLine.qty) - creditedQty);

    if (itemType !== "SERVICE_ITEM" && creditQty > remainingCreditQty) {
      throw new Error(`${sourceLine.productCode} credit qty cannot exceed remaining creditable qty.`);
    }

    const unitPrice = decimal(sourceLine.unitPrice);
    const discountRate = decimal(sourceLine.discountRate);
    const discountType = sourceLine.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT";
    const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
    const sourceQty = toNumber(sourceLine.qty) || 1;
    const sourceDiscountAmount = decimal(sourceLine.discountAmount).mul(qty).div(sourceQty).toDecimalPlaces(2);
    const discountAmount = discountType === "AMOUNT"
      ? (sourceDiscountAmount.gt(lineSubtotal) ? lineSubtotal : sourceDiscountAmount).toDecimalPlaces(2)
      : lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
    const taxableAmount = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

    const requestedClaimAmount = sanitizeMoney(rawLine.claimAmount);
    const creditedAmount = sumCreditedAmount(sourceLine as any);
    const remainingCreditAmount = Math.max(0, toNumber(sourceLine.lineTotal) - creditedAmount);
    let lineTotalBeforeTax = taxableAmount;

    if (itemType === "SERVICE_ITEM" && requestedClaimAmount.gt(0)) {
      if (requestedClaimAmount.gt(new Prisma.Decimal(remainingCreditAmount.toFixed(2)))) {
        throw new Error(`${sourceLine.productCode} credit amount cannot exceed remaining creditable amount.`);
      }
      lineTotalBeforeTax = requestedClaimAmount;
    }

    const lineTaxCodeId = normalizeText(rawLine.taxCodeId) || sourceLine.taxCodeId || null;
    const taxCode = taxSettings.enabled && taxSettings.mode === "LINE_ITEM" && lineTaxCodeId ? taxSettings.taxCodes.get(lineTaxCodeId) || null : null;
    const taxAmount = taxCode ? calculateTaxAmount(lineTotalBeforeTax, taxCode.rate, taxCode.calculationMethod) : new Prisma.Decimal(0);
    const lineTotal = taxCode?.calculationMethod === "INCLUSIVE" ? lineTotalBeforeTax : lineTotalBeforeTax.plus(taxAmount).toDecimalPlaces(2);

    return {
      lineNo: index + 1,
      sourceLine,
      sourceLineId,
      sourceTransactionId: sourceInvoice.id,
      inventoryProductId: sourceLine.inventoryProductId,
      productCode: sourceLine.productCode,
      productDescription: sourceLine.productDescription,
      itemType,
      uom: sourceLine.uom,
      qty,
      unitPrice,
      discountRate,
      discountType,
      discountAmount,
      locationId: normalizeText(rawLine.locationId) || sourceLine.locationId,
      locationCode: sourceLine.locationCode,
      locationName: sourceLine.locationName,
      batchNo: normalizeText(rawLine.batchNo),
      serialNos: normalizeSerialNumbers(rawLine.serialNos),
      taxCodeId: taxCode?.id || null,
      taxCode: taxCode?.code || null,
      taxDescription: taxCode?.description || null,
      taxDisplayLabel: taxCode?.displayLabel || taxCode?.code || null,
      taxRate: taxCode?.rate || new Prisma.Decimal(0),
      taxCalculationMethod: taxCode?.calculationMethod || null,
      taxAmount,
      lineSubtotal,
      lineTotal,
      remarks: normalizeText(rawLine.remarks),
    };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxableSubtotal = subtotal.minus(discountTotal).toDecimalPlaces(2);

  const transactionTaxCodeId = normalizeText(body.taxCodeId) || sourceInvoice.taxCodeId || null;
  const transactionTaxCode = taxSettings.enabled && taxSettings.mode === "TRANSACTION" && transactionTaxCodeId
    ? taxSettings.taxCodes.get(transactionTaxCodeId) || null
    : null;

  const lineTaxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const transactionTaxTotal = transactionTaxCode ? calculateTaxAmount(taxableSubtotal, transactionTaxCode.rate, transactionTaxCode.calculationMethod) : new Prisma.Decimal(0);
  const taxTotal = taxSettings.mode === "LINE_ITEM" ? lineTaxTotal : transactionTaxTotal;
  const grandTotal = taxSettings.mode === "LINE_ITEM"
    ? lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2)
    : transactionTaxCode?.calculationMethod === "INCLUSIVE"
      ? taxableSubtotal
      : taxableSubtotal.plus(taxTotal).toDecimalPlaces(2);

  return {
    docDate,
    requestedDocNo: assertValidManualDocNo(body.docNo),
    sourceInvoice,
    reason,
    docDesc: normalizeText(body.docDesc) || `Credit Note for ${sourceInvoice.docNo}`,
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
    remarks: reason,
    agentId: sourceInvoice.agentId,
    projectId: sourceInvoice.projectId,
    departmentId: sourceInvoice.departmentId,
    termsAndConditions: sourceInvoice.termsAndConditions,
    bankAccount: sourceInvoice.bankAccount,
    footerRemarks: sourceInvoice.footerRemarks,
    subtotal,
    discountTotal,
    taxableSubtotal,
    taxTotal,
    grandTotal,
    taxCodeId: transactionTaxCode?.id || null,
    taxCode: transactionTaxCode?.code || null,
    taxDescription: transactionTaxCode?.description || null,
    taxDisplayLabel: transactionTaxCode?.displayLabel || transactionTaxCode?.code || null,
    taxRate: transactionTaxCode?.rate || null,
    taxCalculationMethod: transactionTaxCode?.calculationMethod || null,
    taxCalculationModeSnapshot: taxSettings.mode,
    isTaxEnabledSnapshot: taxSettings.enabled,
    lines,
  };
}

async function createCreditNoteStockIn(tx: Prisma.TransactionClient, creditNote: any, lines: any[]) {
  const stockLines = lines.filter((line) => line.itemType !== "SERVICE_ITEM" && line.inventoryProductId && line.locationId);
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
    if (line.serialNos.length > 0 && line.serialNos.length !== toNumber(line.qty)) {
      throw new Error(`${line.productCode} serial no count must match credit qty.`);
    }

    if (line.serialNos.length > 0) {
      for (const serialNo of line.serialNos) {
        const serialRecord = await tx.inventorySerial.findUnique({
          where: { inventoryProductId_serialNo: { inventoryProductId: line.inventoryProductId!, serialNo } },
          include: { inventoryBatch: true },
        });
        if (!serialRecord) throw new Error(`Serial No ${serialNo} does not exist.`);
        if (serialRecord.status === "IN_STOCK") throw new Error(`Serial No ${serialNo} is already in stock.`);
        if (line.batchNo && serialRecord.inventoryBatch?.batchNo !== line.batchNo) {
          throw new Error(`Serial No ${serialNo} does not belong to Batch No ${line.batchNo}.`);
        }

        const ledgerValues = buildLedgerValues(createStoredQtyDecimal(1), "IN");
        await tx.stockLedger.create({
          data: {
            movementDate: creditNote.docDate,
            movementType: "SR",
            movementDirection: "IN",
            ...ledgerValues,
            batchNo: line.batchNo || serialRecord.inventoryBatch?.batchNo || null,
            inventoryProductId: line.inventoryProductId!,
            locationId: line.locationId,
            transactionId: null,
            transactionLineId: null,
            referenceNo: creditNote.docNo,
            referenceText: `Credit Note ${creditNote.docNo}`,
            sourceType: "CREDIT_NOTE",
            sourceId: creditNote.id,
            remarks: `${creditNote.remarks || ""} | SERIAL_NO=${serialNo}`,
          },
        });

        await tx.inventorySerial.update({
          where: { id: serialRecord.id },
          data: { status: "IN_STOCK", currentLocationId: line.locationId },
        });
      }
      continue;
    }

    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(line.qty), "IN");
    await tx.stockLedger.create({
      data: {
        movementDate: creditNote.docDate,
        movementType: "SR",
        movementDirection: "IN",
        ...ledgerValues,
        batchNo: line.batchNo,
        inventoryProductId: line.inventoryProductId!,
        locationId: line.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: creditNote.docNo,
        referenceText: `Credit Note ${creditNote.docNo}`,
        sourceType: "CREDIT_NOTE",
        sourceId: creditNote.id,
        remarks: creditNote.remarks || `Credit stock return for ${creditNote.docNo}`,
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
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("CN", docDate));
        return generateCreditNoteNo(tx, docDate);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    if (searchParams.get("sourceInvoices") === "1") {
      const invoices = await db.$transaction(async (tx) => getSourceInvoices(tx));
      return NextResponse.json({ ok: true, invoices });
    }

    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";

    const rows = await db.salesTransaction.findMany({
      where: {
        docType: "CN",
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
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    return NextResponse.json({
      ok: true,
      transactions: rows.map((row) => ({
        ...withCancellationDetails(row),
        sourceLinks: row.targetLinks.map((link) => ({ sourceTransaction: link.sourceTransaction })),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load credit notes." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const created = await db.$transaction(async (tx) => {
      const data = await buildCreditNoteData(body, tx);
      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("CN", data.docDate));

      const docNo = data.requestedDocNo || (await generateCreditNoteNo(tx, data.docDate));
      if (data.requestedDocNo) {
        const exists = await tx.salesTransaction.findUnique({ where: { docNo: data.requestedDocNo }, select: { id: true } });
        if (exists) throw new Error("Credit Note No already exists.");
      }

      const creditNote = await tx.salesTransaction.create({
        data: {
          docType: "CN",
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
          remarks: data.remarks,
          agentId: data.agentId,
          projectId: data.projectId,
          departmentId: data.departmentId,
          subtotal: data.subtotal,
          discountTotal: data.discountTotal,
          taxableSubtotal: data.taxableSubtotal,
          taxCodeId: data.taxCodeId,
          taxCode: data.taxCode,
          taxDescription: data.taxDescription,
          taxDisplayLabel: data.taxDisplayLabel,
          taxRate: data.taxRate,
          taxCalculationMethod: data.taxCalculationMethod,
          taxCalculationModeSnapshot: data.taxCalculationModeSnapshot as any,
          isTaxEnabledSnapshot: data.isTaxEnabledSnapshot,
          taxTotal: data.taxTotal,
          grandTotal: data.grandTotal,
          termsAndConditions: data.termsAndConditions,
          bankAccount: data.bankAccount,
          footerRemarks: data.footerRemarks,
          createdByAdminId: admin.id,
        },
      });

      const createdLines = [];
      for (const line of data.lines) {
        const createdLine = await tx.salesTransactionLine.create({
          data: {
            transactionId: creditNote.id,
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

        await tx.salesTransactionLineLink.create({
          data: {
            sourceLineId: line.sourceLineId,
            targetLineId: createdLine.id,
            sourceTransactionId: line.sourceTransactionId,
            targetTransactionId: creditNote.id,
            linkType: "CREDITED_TO" as any,
            qty: line.qty,
            claimAmount: line.lineTotal,
          },
        });

        createdLines.push({ ...line, id: createdLine.id });
      }

      await tx.salesTransactionLink.create({
        data: {
          sourceTransactionId: data.sourceInvoice.id,
          targetTransactionId: creditNote.id,
          linkType: "GENERATED_TO",
        },
      });

      await createCreditNoteStockIn(tx, creditNote, createdLines);

      await createAuditLogFromRequest({
        req,
        user: admin,
        module: "SALES",
        action: "CREATE",
        entityType: "CREDIT_NOTE",
        entityId: creditNote.id,
        description: `Created Credit Note ${creditNote.docNo} from ${data.sourceInvoice.docNo}`,
      });

      return tx.salesTransaction.findUnique({
        where: { id: creditNote.id },
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
      { ok: false, error: error instanceof Error ? error.message : "Unable to create credit note." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
