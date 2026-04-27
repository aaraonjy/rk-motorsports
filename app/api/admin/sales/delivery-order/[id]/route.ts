import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
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

function roundQty(value: unknown) {
  return roundToDecimalPlaces(Number(value ?? 0), STOCK_STORAGE_DECIMAL_PLACES.qty);
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
      await tx.salesTransaction.update({ where: { id: source.id }, data: { status: nextStatus } });
    }
  }
}

async function reverseStockIssueForDeliveryOrder(tx: Prisma.TransactionClient, deliveryOrder: any, adminId: string, cancelReason: string | null) {
  const stockTransaction = await tx.stockTransaction.findFirst({
    where: {
      transactionType: "SI",
      reference: deliveryOrder.docNo,
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
        referenceText: `Cancel Delivery Order ${deliveryOrder.docNo}`,
        sourceType: "SALES_DELIVERY_ORDER_CANCEL",
        sourceId: deliveryOrder.id,
        remarks: cancelReason || `Cancellation reversal for ${deliveryOrder.docNo}`,
      },
    });
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

    if (!transaction || transaction.docType !== "DO") {
      return NextResponse.json({ ok: false, error: "Delivery Order not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load delivery order." },
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

    if (action !== "cancel") {
      return NextResponse.json({ ok: false, error: "Delivery Order can only be cancelled after creation." }, { status: 400 });
    }

    const cancelled = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, `sales-transaction:${id}`);

      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          lines: true,
          sourceLinks: { select: { sourceTransactionId: true } },
          targetLinks: {
            include: {
              targetTransaction: { select: { id: true, docType: true, status: true } },
            },
          },
        },
      });

      if (!current || current.docType !== "DO") throw new Error("Delivery Order not found.");
      if (current.status === "CANCELLED") throw new Error("This Delivery Order is already cancelled.");

      const hasActiveInvoice = current.targetLinks.some(
        (link) => ["INV", "CS"].includes(String(link.targetTransaction?.docType || "")) && link.targetTransaction?.status !== "CANCELLED"
      );
      if (hasActiveInvoice) {
        throw new Error("This Delivery Order has been generated to an active invoice. Cancel the invoice first.");
      }

      await reverseStockIssueForDeliveryOrder(tx, current, admin.id, cancelReason);

      const updated = await tx.salesTransaction.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByAdminId: admin.id,
          cancelReason,
        },
        include: {
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          lines: true,
        },
      });

      await refreshSalesOrderStatuses(tx, current.sourceLinks.map((link) => link.sourceTransactionId));

      return updated;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CANCEL",
      entityType: "SALES_DELIVERY_ORDER",
      entityId: cancelled.id,
      description: `Cancelled Delivery Order ${cancelled.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: cancelled });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update delivery order." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
