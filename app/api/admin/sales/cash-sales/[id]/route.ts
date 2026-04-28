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
  buildTransactionEntityLockKey,
  buildTransactionNumberLockKey,
  createStoredQtyDecimal,
  generateStockDocumentNumber,
  generateStockTransactionNumber,
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
    taxableSubtotal,
    taxTotal,
    grandTotal,
    transactionTaxCode,
    taxCalculationModeSnapshot: taxSettings.mode,
    isTaxEnabledSnapshot: taxSettings.enabled,
    lines,
  };
}

async function createStockIssueForDirectCashSales(tx: Prisma.TransactionClient, adminId: string, cashSales: any, lines: Array<any>, body: any) {
  const stockLines = lines.filter((line) => line.itemType !== "SERVICE_ITEM");
  if (stockLines.length === 0) return null;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireAdvisoryLock(tx, buildTransactionNumberLockKey("SI", cashSales.docDate));
  await acquireAdvisoryLock(tx, buildDocumentNumberLockKey("SI", cashSales.docDate));
  await acquireStockMutationLocks(tx, stockLines.map((line) => ({ inventoryProductId: line.inventoryProductId!, locationId: line.locationId, batchNo: line.batchNo, serialNos: line.serialNos || [] })));

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
      if (availableCount !== (line.serialNos || []).length) throw new Error(`${line.productCode} has one or more unavailable S/N at the selected location${line.batchNo ? " / batch" : ""}.`);
      continue;
    }
    const balance = await getStockBalance(tx, line.inventoryProductId!, line.locationId, { batchNo: line.batchNo });
    if (balance < requiredQty && !config.allowNegativeStock) throw new Error(`Insufficient stock for ${line.productCode}. Current balance: ${balance}. Required: ${requiredQty}.`);
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
        where: { inventoryProductId_serialNo: { inventoryProductId: stockLine.inventoryProductId, serialNo: serialEntry.serialNo } },
        include: { inventoryBatch: true },
      });
      if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== stockLine.locationId) {
        throw new Error(`Serial No ${serialEntry.serialNo} is not available at the selected location.`);
      }
      if (stockLine.batchNo && serialRecord.inventoryBatch?.batchNo !== stockLine.batchNo) {
        throw new Error(`Serial No ${serialEntry.serialNo} does not belong to Batch No ${stockLine.batchNo}.`);
      }
      await tx.inventorySerial.update({ where: { id: serialRecord.id }, data: { status: "OUT_OF_STOCK", currentLocationId: null } });
      await tx.stockTransactionLineSerial.update({ where: { id: serialEntry.id }, data: { inventorySerialId: serialRecord.id, inventoryBatchId: serialRecord.inventoryBatchId } });
    }
  }
}

function buildSalesUpdateData(data: Awaited<ReturnType<typeof buildDirectCashSalesData>>, body: any, adminId: string) {
  return {
    docDate: data.docDate,
    docDesc: normalizeText(body.docDesc),
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

async function reverseStockIssueForCashSales(tx: Prisma.TransactionClient, cashSales: any, adminId: string, cancelReason: string | null) {
  const stockTransaction = await tx.stockTransaction.findFirst({
    where: {
      transactionType: "SI",
      reference: cashSales.docNo,
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
        referenceText: `Cancel Cash Sales ${cashSales.docNo}`,
        sourceType: "SALES_CASH_SALES_CANCEL",
        sourceId: cashSales.id,
        remarks: cancelReason || `Cancellation reversal for ${cashSales.docNo}`,
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
            targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
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

    if (!transaction || transaction.docType !== "CS") {
      return NextResponse.json({ ok: false, error: "Cash Sales not found." }, { status: 404 });
    }

    const stockIssue = await db.stockTransaction.findFirst({
      where: { transactionType: "SI", reference: transaction.docNo, status: { not: "CANCELLED" } },
      include: { lines: { orderBy: { createdAt: "asc" }, include: { serialEntries: { orderBy: { serialNo: "asc" } } } } },
    });

    const transactionWithStockPicking = {
      ...withPaymentSummary(withCancellationDetails(transaction)),
      lines: transaction.lines.map((line, index) => ({
        ...line,
        batchNo: stockIssue?.lines[index]?.batchNo || null,
        serialNos: stockIssue?.lines[index]?.serialEntries.map((entry) => entry.serialNo) || [],
      })),
    };

    return NextResponse.json({ ok: true, transaction: transactionWithStockPicking });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load cash sales." },
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
      return NextResponse.json({ ok: false, error: "Invalid Cash Sales action." }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, `sales-transaction:${id}`);

      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          revisedFrom: { select: { id: true, docNo: true } },
          lines: true,
          payments: {
            orderBy: { paymentDate: "asc" },
            include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
          },
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

      if (!current || current.docType !== "CS") throw new Error("Cash Sales not found.");
      if (current.status === "CANCELLED") throw new Error("This Cash Sales is already cancelled.");

      const hasActiveInvoice = current.sourceLinks.some(
        (link) => ["CS", "CS"].includes(String(link.targetTransaction?.docType || "")) && link.targetTransaction?.status !== "CANCELLED"
      );
      if (hasActiveInvoice) throw new Error("This Cash Sales has been generated to an active invoice. Cancel the invoice first.");

      if (action === "cancel") {
        await reverseStockIssueForCashSales(tx, current, admin.id, cancelReason);

        const updated = await tx.salesTransaction.update({
          where: { id },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByAdminId: admin.id, cancelReason },
          include: {
            cancelledByAdmin: { select: { id: true, name: true, email: true } },
            lines: true,
            payments: {
              orderBy: { paymentDate: "asc" },
              include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
            },
          },
        });

        await refreshSalesOrderStatuses(tx, current.targetLinks.map((link) => link.sourceTransaction?.id).filter(Boolean) as string[]);
        return { transaction: updated, auditAction: "CANCEL" as const, description: `Cancelled Cash Sales ${updated.docNo}.` };
      }

      if (hasSalesOrderSource(current)) {
        throw new Error("Cash Sales generated from Sales Order cannot be edited. Please cancel this DO and generate a new DO from the original SO.");
      }

      const data = await buildDirectCashSalesData(body, tx);
      const paymentInput = getPaymentInput(body);
      const existingTotalPaid = (current.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0);
      validatePaymentAmount(paymentInput.amount, data.grandTotal, existingTotalPaid);
      const nextTotalPaid = Math.round((existingTotalPaid + paymentInput.amount + Number.EPSILON) * 100) / 100;
      const nextStatus = getCashSalesStatusForPayment(data.grandTotal, nextTotalPaid);
      const revisedStatus = getCashSalesStatusForPayment(data.grandTotal, paymentInput.amount);

      await reverseStockIssueForCashSales(tx, current, admin.id, action === "revise" ? "Revised Cash Sales" : "Edited Cash Sales");

      if (action === "edit") {
        await tx.salesTransactionLine.deleteMany({ where: { transactionId: current.id } });
        const updated = await tx.salesTransaction.update({
          where: { id: current.id },
          data: {
            ...buildSalesUpdateData(data, body, admin.id),
            docNo: current.docNo,
            status: nextStatus,
            cancelledAt: null,
            cancelledByAdminId: null,
            cancelReason: null,
            lines: { create: buildLineCreateData(data.lines) },
          },
          include: {
            lines: true,
            payments: {
              orderBy: { paymentDate: "asc" },
              include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
            },
          },
        });

        await createSalesTransactionPaymentIfNeeded(tx, updated.id, admin.id, paymentInput);
        await createStockIssueForDirectCashSales(tx, admin.id, updated, data.lines, body);
        const updatedWithPayments = await tx.salesTransaction.findUnique({
          where: { id: updated.id },
          include: {
            lines: true,
            payments: {
              orderBy: { paymentDate: "asc" },
              include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
            },
          },
        });
        return { transaction: updatedWithPayments || updated, auditAction: "UPDATE" as const, description: `Updated Cash Sales ${updated.docNo}.` };
      }

      const nextDocNo = await generateCashSalesRevisionNo(tx, current);
      const revised = await tx.salesTransaction.create({
        data: {
          docType: "CS",
          docNo: nextDocNo,
          status: revisedStatus,
          revisedFromId: current.revisedFromId || current.id,
          ...buildSalesUpdateData(data, body, admin.id),
          lines: { create: buildLineCreateData(data.lines) },
        },
        include: {
          lines: true,
          payments: {
            orderBy: { paymentDate: "asc" },
            include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await createSalesTransactionPaymentIfNeeded(tx, revised.id, admin.id, paymentInput);

      await tx.salesTransaction.update({
        where: { id: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByAdminId: admin.id, cancelReason: "Revised Cash Sales" },
      });

      await createStockIssueForDirectCashSales(tx, admin.id, revised, data.lines, body);
      const revisedWithPayments = await tx.salesTransaction.findUnique({
        where: { id: revised.id },
        include: {
          lines: true,
          payments: {
            orderBy: { paymentDate: "asc" },
            include: { createdByAdmin: { select: { id: true, name: true, email: true } } },
          },
        },
      });
      return { transaction: revisedWithPayments || revised, auditAction: "REVISE" as const, description: `Revised Cash Sales ${current.docNo} to ${revised.docNo}.` };
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: result.auditAction,
      entityType: "SALES_CASH_SALES",
      entityId: result.transaction.id,
      description: result.description,
    });

    return NextResponse.json({ ok: true, transaction: withPaymentSummary(withCancellationDetails(result.transaction)) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update cash sales." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
