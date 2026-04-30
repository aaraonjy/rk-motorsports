import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireAdvisoryLock,
  acquireStockMutationLocks,
  buildLedgerValues,
  createStoredQtyDecimal,
} from "@/lib/stock";

type DeliveryReturnLinePayload = {
  sourceLineId?: string | null;
  sourceTransactionId?: string | null;
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

function decimal(value: number | string | null | undefined, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(2));
}

function qtyDecimal(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Return quantity must be greater than zero.");
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
  if (!year || !month || !day) throw new Error("Unable to generate delivery return date prefix.");
  return { year, month, day };
}

function buildSalesDocumentNumberLockKey(docType: string, documentDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(documentDate);
  return `sales-docno:${docType}:${year}${month}${day}`;
}

async function generateDeliveryReturnNo(tx: Prisma.TransactionClient, docDate: Date) {
  const { year, month, day } = getMalaysiaDateParts(docDate);
  const prefix = `DR-${year}${month}${day}`;
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`);

  const existing = await tx.salesTransaction.findMany({
    where: { docType: "DR", docNo: { startsWith: `${prefix}-` } },
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
  if (!/^DR-\d{8}-\d{4}$/.test(docNo)) {
    throw new Error("Delivery Return No must use DR-YYYYMMDD-0001 format.");
  }
  return docNo;
}

function sumReturnedQty(line: {
  sourceLineLinks?: Array<{ linkType?: string | null; qty?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
}) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === "RETURNED_TO")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}

function sumReturnedAmount(line: {
  sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null } | null }>;
}) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === "RETURNED_TO")
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

async function getSourceDeliveryOrders(tx: Prisma.TransactionClient) {
  const deliveryOrders = await tx.salesTransaction.findMany({
    where: { docType: "DO", status: { not: "CANCELLED" } },
    orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
    include: {
      sourceLinks: {
        include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } } },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          inventoryProduct: { select: { itemType: true, batchTracking: true, serialNumberTracking: true } },
          sourceLineLinks: {
            include: { targetTransaction: { select: { id: true, status: true, docType: true, docNo: true } } },
          },
        },
      },
    },
  });

  const stockRows = deliveryOrders.length
    ? await tx.stockLedger.findMany({
        where: {
          sourceType: "SALES_DELIVERY_ORDER",
          sourceId: { in: deliveryOrders.map((item) => item.id) },
          movementDirection: "OUT",
        },
        orderBy: [{ createdAt: "asc" }],
        select: { sourceId: true, inventoryProductId: true, locationId: true, batchNo: true, remarks: true },
      })
    : [];

  const stockMap = new Map<string, { batchNo: string | null; serialNos: string[] }>();
  for (const row of stockRows) {
    const key = `${row.sourceId || ""}__${row.inventoryProductId || ""}__${row.locationId || ""}`;
    const existing = stockMap.get(key) || { batchNo: row.batchNo || null, serialNos: [] };
    if (!existing.batchNo && row.batchNo) existing.batchNo = row.batchNo;
    const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
    const serialNo = serialMatch?.[1]?.trim();
    if (serialNo && !existing.serialNos.some((item) => item.toUpperCase() === serialNo.toUpperCase())) existing.serialNos.push(serialNo);
    stockMap.set(key, existing);
  }

  return deliveryOrders
    .map((order) => ({
      ...order,
      lines: order.lines.map((line) => {
        const qty = toNumber(line.qty);
        const returnedQty = sumReturnedQty(line);
        const lineTotal = toNumber(line.lineTotal);
        const returnedAmount = sumReturnedAmount(line);
        const stock = stockMap.get(`${order.id}__${line.inventoryProductId || ""}__${line.locationId || ""}`);
        return {
          ...line,
          itemType: line.inventoryProduct?.itemType || "STOCK_ITEM",
          batchTracking: Boolean(line.inventoryProduct?.batchTracking),
          serialNumberTracking: Boolean(line.inventoryProduct?.serialNumberTracking),
          returnedQty,
          returnedAmount,
          remainingReturnQty: Math.max(0, qty - returnedQty),
          remainingReturnAmount: Math.max(0, lineTotal - returnedAmount),
          batchNo: stock?.batchNo || null,
          serialNos: stock?.serialNos || [],
        };
      }),
    }))
    .filter((order) => order.lines.some((line) => toNumber((line as any).remainingReturnQty) > 0));
}

async function createDeliveryReturnStockIn(tx: Prisma.TransactionClient, deliveryReturn: any, lines: Array<any>, remarks: string | null) {
  const stockLines = lines.filter((line) => line.itemType !== "SERVICE_ITEM");
  if (stockLines.length === 0) return;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireStockMutationLocks(
    tx,
    stockLines.map((line) => ({
      inventoryProductId: line.inventoryProductId,
      locationId: line.locationId,
      batchNo: line.batchNo,
      serialNos: line.serialNos || [],
    }))
  );

  for (const line of stockLines) {
    const baseRemarks = line.remarks || remarks || `Delivery return stock in for ${deliveryReturn.docNo}`;

    if (Array.isArray(line.serialNos) && line.serialNos.length > 0) {
      for (const serialNo of line.serialNos) {
        const serialRecord = await tx.inventorySerial.findUnique({
          where: { inventoryProductId_serialNo: { inventoryProductId: line.inventoryProductId, serialNo } },
          include: { inventoryBatch: true },
        });
        if (!serialRecord) throw new Error(`Serial No ${serialNo} cannot be found.`);
        if (serialRecord.status !== "OUT_OF_STOCK") throw new Error(`Serial No ${serialNo} is not in outbound state and cannot be returned.`);
        if (line.batchNo && serialRecord.inventoryBatch?.batchNo !== line.batchNo) throw new Error(`Serial No ${serialNo} does not belong to Batch No ${line.batchNo}.`);

        const ledgerValues = buildLedgerValues(createStoredQtyDecimal(1), "IN");
        await tx.stockLedger.create({
          data: {
            movementDate: deliveryReturn.docDate,
            movementType: "SR",
            movementDirection: "IN",
            ...ledgerValues,
            batchNo: line.batchNo || serialRecord.inventoryBatch?.batchNo || null,
            inventoryProductId: line.inventoryProductId,
            locationId: line.locationId,
            transactionId: null,
            transactionLineId: null,
            referenceNo: deliveryReturn.docNo,
            referenceText: `Delivery Return ${deliveryReturn.docNo}`,
            sourceType: "DELIVERY_RETURN",
            sourceId: deliveryReturn.id,
            remarks: `${baseRemarks} | SERIAL_NO=${serialNo}`,
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
        movementDate: deliveryReturn.docDate,
        movementType: "SR",
        movementDirection: "IN",
        ...ledgerValues,
        batchNo: line.batchNo || null,
        inventoryProductId: line.inventoryProductId,
        locationId: line.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: deliveryReturn.docNo,
        referenceText: `Delivery Return ${deliveryReturn.docNo}`,
        sourceType: "DELIVERY_RETURN",
        sourceId: deliveryReturn.id,
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
        await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("DR", docDate));
        return generateDeliveryReturnNo(tx, docDate);
      });
      return NextResponse.json({ ok: true, docNo });
    }

    const rows = await db.salesTransaction.findMany({
      where: { docType: "DR" },
      orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
      take: 100,
      include: {
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        targetLinks: {
          include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } },
        },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    const sourceDeliveryOrders = await db.$transaction(async (tx) => getSourceDeliveryOrders(tx));
    return NextResponse.json({ ok: true, transactions: rows.map(withCancellationDetails), sourceDeliveryOrders });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load delivery returns." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const docDate = normalizeDate(body.docDate);
    const manualDocNo = assertValidManualDocNo(body.docNo);
    const sourceTransactionId = normalizeText(body.sourceTransactionId);
    const rawLines = Array.isArray(body.lines) ? (body.lines as DeliveryReturnLinePayload[]) : [];
    if (!sourceTransactionId) throw new Error("Please select a Delivery Order.");
    if (rawLines.length === 0) throw new Error("Please add at least one return line.");

    const created = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, buildSalesDocumentNumberLockKey("DR", docDate));
      const docNo = manualDocNo || await generateDeliveryReturnNo(tx, docDate);

      const source = await tx.salesTransaction.findUnique({
        where: { id: sourceTransactionId },
        include: {
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              inventoryProduct: { select: { itemType: true, batchTracking: true, serialNumberTracking: true } },
              sourceLineLinks: {
                include: { targetTransaction: { select: { id: true, status: true, docType: true, docNo: true } } },
              },
            },
          },
        },
      });

      if (!source || source.docType !== "DO" || source.status === "CANCELLED") throw new Error("Selected Delivery Order is invalid.");
      const sourceLineMap = new Map(source.lines.map((line) => [line.id, line]));

      const preparedLines = rawLines.map((line, index) => {
        const sourceLineId = normalizeText(line.sourceLineId);
        const sourceLine = sourceLineId ? sourceLineMap.get(sourceLineId) : null;
        if (!sourceLine) throw new Error(`Return line ${index + 1} has invalid source line.`);
        const qty = qtyDecimal(line.qty);
        const returnedQty = sumReturnedQty(sourceLine);
        const remainingQty = Math.max(0, toNumber(sourceLine.qty) - returnedQty);
        if (toNumber(qty) > remainingQty) throw new Error(`${sourceLine.productCode} return quantity cannot exceed remaining returnable qty (${remainingQty}).`);

        const itemType = sourceLine.inventoryProduct?.itemType || "STOCK_ITEM";
        const serialNos = normalizeSerialNumbers(line.serialNos);
        const batchNo = normalizeText(line.batchNo)?.toUpperCase() || null;

        if (itemType !== "SERVICE_ITEM" && sourceLine.inventoryProduct?.batchTracking && !batchNo) throw new Error(`${sourceLine.productCode} requires Batch No.`);
        if (itemType !== "SERVICE_ITEM" && sourceLine.inventoryProduct?.serialNumberTracking) {
          if (serialNos.length === 0) throw new Error(`${sourceLine.productCode} requires S/N No.`);
          if (serialNos.length !== toNumber(qty)) throw new Error(`${sourceLine.productCode} return quantity must match selected S/N count.`);
        }

        const unitPrice = decimal(line.unitPrice, toNumber(sourceLine.unitPrice));
        const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
        const discountRate = decimal(line.discountRate, toNumber(sourceLine.discountRate));
        const discountType = String(line.discountType || sourceLine.discountType || "PERCENT").toUpperCase() === "AMOUNT" ? "AMOUNT" : "PERCENT";
        const discountAmount = discountType === "AMOUNT" ? new Prisma.Decimal(0) : lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
        const lineTotal = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);

        return {
          lineNo: index + 1,
          sourceLine,
          sourceLineId: sourceLine.id,
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
          locationId: sourceLine.locationId,
          locationCode: sourceLine.locationCode,
          locationName: sourceLine.locationName,
          taxCodeId: sourceLine.taxCodeId,
          taxCode: sourceLine.taxCode,
          taxDescription: sourceLine.taxDescription,
          taxDisplayLabel: sourceLine.taxDisplayLabel,
          taxRate: sourceLine.taxRate,
          taxCalculationMethod: sourceLine.taxCalculationMethod,
          taxAmount: new Prisma.Decimal(0),
          lineSubtotal,
          lineTotal,
          batchNo,
          serialNos,
          remarks: normalizeText(line.remarks),
        };
      });

      const subtotal = preparedLines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
      const discountTotal = preparedLines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
      const grandTotal = preparedLines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

      const deliveryReturn = await tx.salesTransaction.create({
        data: {
          docType: "DR",
          docNo,
          docDate,
          docDesc: normalizeText(body.docDesc),
          status: "COMPLETED",
          customerId: source.customerId,
          customerAccountNo: source.customerAccountNo,
          customerName: source.customerName,
          billingAddressLine1: source.billingAddressLine1,
          billingAddressLine2: source.billingAddressLine2,
          billingAddressLine3: source.billingAddressLine3,
          billingAddressLine4: source.billingAddressLine4,
          billingCity: source.billingCity,
          billingPostCode: source.billingPostCode,
          billingCountryCode: source.billingCountryCode,
          deliveryAddressLine1: source.deliveryAddressLine1,
          deliveryAddressLine2: source.deliveryAddressLine2,
          deliveryAddressLine3: source.deliveryAddressLine3,
          deliveryAddressLine4: source.deliveryAddressLine4,
          deliveryCity: source.deliveryCity,
          deliveryPostCode: source.deliveryPostCode,
          deliveryCountryCode: source.deliveryCountryCode,
          attention: source.attention,
          contactNo: source.contactNo,
          email: source.email,
          currency: source.currency,
          reference: source.docNo,
          remarks: normalizeText(body.remarks),
          agentId: source.agentId,
          projectId: source.projectId,
          departmentId: source.departmentId,
          subtotal,
          discountTotal,
          taxableSubtotal: subtotal.minus(discountTotal).toDecimalPlaces(2),
          taxTotal: new Prisma.Decimal(0),
          grandTotal,
          termsAndConditions: source.termsAndConditions,
          bankAccount: source.bankAccount,
          footerRemarks: normalizeText(body.footerRemarks),
          createdByAdminId: admin.id,
          lines: {
            create: preparedLines.map((line) => ({
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

      await tx.salesTransactionLink.create({
        data: { sourceTransactionId: source.id, targetTransactionId: deliveryReturn.id, linkType: "GENERATED_TO" },
      });

      for (const line of preparedLines) {
        const targetLine = deliveryReturn.lines.find((item) => item.lineNo === line.lineNo);
        if (!targetLine) continue;
        await tx.salesTransactionLineLink.create({
          data: {
            sourceLineId: line.sourceLineId,
            targetLineId: targetLine.id,
            sourceTransactionId: source.id,
            targetTransactionId: deliveryReturn.id,
            linkType: "RETURNED_TO",
            qty: line.qty,
            claimAmount: line.lineTotal,
          },
        });
      }

      await createDeliveryReturnStockIn(tx, deliveryReturn, preparedLines, normalizeText(body.remarks));
      return deliveryReturn;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CREATE",
      entityType: "DELIVERY_RETURN",
      entityId: created.id,
      description: `Created Delivery Return ${created.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: created });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create delivery return." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
