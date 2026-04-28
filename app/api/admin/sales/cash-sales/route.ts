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

type CashSalesLinePayload = {
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

function getCashSalesStatusForPayment(grandTotal: Prisma.Decimal | number | string, totalPaid: number) {
  const total = toNumber(grandTotal);
  if (total <= 0 || totalPaid >= total) return "COMPLETED" as SalesTransactionStatus;
  return "OPEN" as SalesTransactionStatus;
}

function withPaymentSummary<T extends Record<string, any>>(transaction: T) {
  const payments = Array.isArray(transaction.payments) ? transaction.payments : [];
  const summary = calculateSalesPaymentSummary(payments, transaction.grandTotal);
  return {
    ...transaction,
    payments,
    totalPaid: summary.totalPaid,
    outstandingBalance: summary.outstandingBalance,
    paymentStatus: summary.paymentStatus,
  };
}

function validatePaymentAmount(paymentAmount: number, grandTotal: Prisma.Decimal | number | string, existingPaid = 0) {
  const outstanding = Math.max(0, Math.round((toNumber(grandTotal) - existingPaid + Number.EPSILON) * 100) / 100);
  if (paymentAmount > outstanding) {
    throw new Error("Payment amount cannot exceed the outstanding balance.");
  }
}

async function createSalesTransactionPaymentIfNeeded(
  tx: Prisma.TransactionClient,
  transactionId: string,
  adminId: string,
  paymentInput: { amount: number; paymentMode: string; paymentDate: Date }
) {
  if (paymentInput.amount <= 0) return null;

  return tx.salesTransactionPayment.create({
    data: {
      salesTransactionId: transactionId,
      paymentDate: paymentInput.paymentDate,
      paymentMode: paymentInput.paymentMode,
      amount: new Prisma.Decimal(paymentInput.amount.toFixed(2)),
      createdByAdminId: adminId,
    },
  });
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

function applyLineTax(line: any, taxSettings: Awaited<ReturnType<typeof loadTaxSettings>>, requestedTaxCodeId: string | null) {
  const taxCode = taxSettings.enabled && taxSettings.mode === "LINE_ITEM" && requestedTaxCodeId ? taxSettings.taxCodes.get(requestedTaxCodeId) : null;
  const taxAmount = taxCode ? calculateTaxAmount(line.lineTotal, taxCode.rate, taxCode.calculationMethod) : new Prisma.Decimal(0);
  const lineTotal = taxCode?.calculationMethod === "INCLUSIVE" ? line.lineTotal : line.lineTotal.plus(taxAmount).toDecimalPlaces(2);

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

function calculateTransactionTotals(lines: any[], taxSettings: Awaited<ReturnType<typeof loadTaxSettings>>, transactionTaxCodeId: string | null) {
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
    shouldCreateStockIssue: true,
  };
}

async function createStockIssueForCashSales(
  tx: Prisma.TransactionClient,
  adminId: string,
  cashSales: any,
  lines: Array<any>,
  body: any
) {
  const stockLines = lines.filter((line) => line.itemType !== "SERVICE_ITEM");
  if (stockLines.length === 0) return null;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireAdvisoryLock(tx, buildTransactionNumberLockKey("SI", cashSales.docDate));
  await acquireAdvisoryLock(tx, buildDocumentNumberLockKey("SI", cashSales.docDate));
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

  const transactionNo = await generateStockTransactionNumber(tx, "SI", cashSales.docDate);
  const stockDocNo = await generateStockDocumentNumber(tx, "SI", cashSales.docDate);

  const stockTransaction = await tx.stockTransaction.create({
    data: {
      transactionNo,
      docNo: stockDocNo,
      docDate: cashSales.docDate,
      docDesc: `Auto stock issue for ${cashSales.docNo}`,
      transactionType: "SI",
      transactionDate: cashSales.docDate,
      reference: cashSales.docNo,
      remarks: normalizeText(body.stockRemarks) || cashSales.remarks || `Auto generated from Cash Sales ${cashSales.docNo}`,
      projectId: cashSales.projectId,
      departmentId: cashSales.departmentId,
      createdByAdminId: adminId,
      lines: {
        create: stockLines.map((line) => ({
          inventoryProductId: line.inventoryProductId!,
          qty: line.qty,
          locationId: line.locationId,
          batchNo: line.batchNo,
          remarks: line.remarks || `Auto stock issue for ${cashSales.docNo}`,
          serialEntries: (line.serialNos || []).length
            ? {
                create: (line.serialNos || []).map((serialNo: string) => ({
                  inventoryProductId: line.inventoryProductId!,
                  serialNo,
                })),
              }
            : undefined,
        })),
      },
    },
    include: { lines: { include: { serialEntries: true } } },
  });

  for (const stockLine of stockTransaction.lines) {
    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(stockLine.qty), "OUT");
    await tx.stockLedger.create({
      data: {
        movementDate: cashSales.docDate,
        movementType: "SI",
        movementDirection: "OUT",
        ...ledgerValues,
        batchNo: stockLine.batchNo,
        inventoryProductId: stockLine.inventoryProductId,
        locationId: stockLine.locationId!,
        transactionId: stockTransaction.id,
        transactionLineId: stockLine.id,
        referenceNo: stockTransaction.transactionNo,
        referenceText: `Cash Sales ${cashSales.docNo}`,
        sourceType: "SALES_CASH_SALES",
        sourceId: cashSales.id,
        remarks: stockLine.remarks,
      },
    });

    for (const serialEntry of stockLine.serialEntries || []) {
      const serialRecord = await tx.inventorySerial.findUnique({
        where: {
          inventoryProductId_serialNo: {
            inventoryProductId: stockLine.inventoryProductId,
            serialNo: serialEntry.serialNo,
          },
        },
        include: { inventoryBatch: true },
      });

      if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== stockLine.locationId) {
        throw new Error(`Serial No ${serialEntry.serialNo} is not available at the selected location.`);
      }
      if (stockLine.batchNo && serialRecord.inventoryBatch?.batchNo !== stockLine.batchNo) {
        throw new Error(`Serial No ${serialEntry.serialNo} does not belong to Batch No ${stockLine.batchNo}.`);
      }

      await tx.inventorySerial.update({
        where: { id: serialRecord.id },
        data: { status: "OUT_OF_STOCK", currentLocationId: null },
      });
      await tx.stockTransactionLineSerial.update({
        where: { id: serialEntry.id },
        data: { inventorySerialId: serialRecord.id, inventoryBatchId: serialRecord.inventoryBatchId },
      });
    }
  }

  return stockTransaction;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("nextRevisionDocNo") === "1" || (searchParams.get("nextDocNo") === "1" && searchParams.get("mode") === "revise")) {
      const docNo = await db.$transaction(async (tx) => {
        return generateCashSalesRevisionNoFromRequest(tx, searchParams);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    if (searchParams.get("nextDocNo") === "1") {
      const docDate = normalizeDate(searchParams.get("docDate"));
      const docNo = await db.$transaction(async (tx) => {
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("CS", docDate));
        return generateCashSalesNo(tx, docDate);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";

    const rows = await db.salesTransaction.findMany({
      where: {
        docType: "CS",
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
        payments: {
          orderBy: { paymentDate: "asc" },
          include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
        },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    const stockIssues = rows.length
      ? await db.stockTransaction.findMany({
          where: { transactionType: "SI", reference: { in: rows.map((row) => row.docNo) }, status: { not: "CANCELLED" } },
          include: { lines: { orderBy: { createdAt: "asc" }, include: { serialEntries: { orderBy: { serialNo: "asc" } } } } },
        })
      : [];
    const stockIssueByReference = new Map(stockIssues.map((item) => [item.reference || "", item]));

    const transactions = rows.map((row) => {
      const stockIssue = stockIssueByReference.get(row.docNo);
      return {
        ...withPaymentSummary(withCancellationDetails(row)),
        lines: row.lines.map((line, index) => ({
          ...line,
          batchNo: stockIssue?.lines[index]?.batchNo || null,
          serialNos: stockIssue?.lines[index]?.serialEntries.map((entry) => entry.serialNo) || [],
        })),
        sourceLinks: row.targetLinks.map((link) => ({
          sourceTransaction: link.sourceTransaction,
        })),
      };
    });

    return NextResponse.json({ ok: true, transactions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load cash sales." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const created = await db.$transaction(async (tx) => {
      const data = await buildCashSalesData(body, tx);
      const paymentInput = getPaymentInput(body);
      validatePaymentAmount(paymentInput.amount, data.grandTotal, 0);
      const initialStatus = getCashSalesStatusForPayment(data.grandTotal, paymentInput.amount);

      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("CS", data.docDate));
      for (const sourceTransactionId of data.sourceTransactionIds) {
        await acquireAdvisoryLock(tx, `sales-transaction:${sourceTransactionId}`);
      }

      const docNo = data.requestedDocNo || await generateCashSalesNo(tx, data.docDate);
      const duplicate = await tx.salesTransaction.findUnique({ where: { docNo }, select: { id: true } });
      if (duplicate) throw new Error("Document No already exists. Please save again so the system can generate the next available number.");

      const cashSales = await tx.salesTransaction.create({
        data: {
          docType: "CS",
          docNo,
          docDate: data.docDate,
          docDesc: data.docDesc,
          status: initialStatus,
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
          taxCodeId: data.transactionTaxCode?.id || null,
          taxCode: data.transactionTaxCode?.code || null,
          taxDescription: data.transactionTaxCode?.description || null,
          taxDisplayLabel: data.transactionTaxCode?.displayLabel || data.transactionTaxCode?.code || null,
          taxRate: data.transactionTaxCode?.rate || null,
          taxCalculationMethod: data.transactionTaxCode?.calculationMethod || null,
          taxCalculationModeSnapshot: data.taxCalculationModeSnapshot as any,
          isTaxEnabledSnapshot: data.isTaxEnabledSnapshot,
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
        include: {
          lines: true,
          payments: {
            orderBy: { paymentDate: "asc" },
            include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await createSalesTransactionPaymentIfNeeded(tx, cashSales.id, admin.id, paymentInput);

      const createdLineByNo = new Map(cashSales.lines.map((line) => [line.lineNo, line]));

      for (const line of data.lines) {
        if (!line.sourceLineId || !line.sourceTransactionId) continue;
        const targetLine = createdLineByNo.get(line.lineNo);
        if (!targetLine) continue;
        await tx.salesTransactionLineLink.create({
          data: {
            sourceLineId: line.sourceLineId,
            targetLineId: targetLine.id,
            sourceTransactionId: line.sourceTransactionId,
            targetTransactionId: cashSales.id,
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
            targetTransactionId: cashSales.id,
            linkType: "GENERATED_TO",
          },
        });
      }

      if (data.shouldCreateStockIssue) {
        await createStockIssueForCashSales(tx, admin.id, cashSales, data.lines, body);
      }
      await refreshSalesOrderStatuses(tx, data.sourceTransactionIds);

      return tx.salesTransaction.findUnique({
        where: { id: cashSales.id },
        include: {
          lines: true,
          payments: {
            orderBy: { paymentDate: "asc" },
            include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
          },
        },
      });
    });

    if (!created) {
      throw new Error("Unable to create cash sales.");
    }

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CREATE",
      entityType: "SALES_CASH_SALES",
      entityId: created.id,
      description: `Created Cash Sales ${created.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: withPaymentSummary(created) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create cash sales." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
