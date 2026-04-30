import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireStockMutationLocks,
  buildLedgerValues,
  createStoredQtyDecimal,
  getStockBalance,
} from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

async function reverseDeliveryReturnStock(tx: Prisma.TransactionClient, deliveryReturn: any, reason: string) {
  const rows = await tx.stockLedger.findMany({
    where: { sourceType: "DELIVERY_RETURN", sourceId: deliveryReturn.id, movementDirection: "IN" },
    orderBy: [{ createdAt: "asc" }],
  });
  if (rows.length === 0) return;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireStockMutationLocks(
    tx,
    rows.map((row) => {
      const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
      return {
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        batchNo: row.batchNo,
        serialNos: serialMatch ? [serialMatch[1].trim()] : [],
      };
    })
  );

  for (const row of rows) {
    const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
    const serialNo = serialMatch ? serialMatch[1].trim() : "";

    if (serialNo) {
      const serial = await tx.inventorySerial.findUnique({
        where: { inventoryProductId_serialNo: { inventoryProductId: row.inventoryProductId, serialNo } },
        include: { inventoryBatch: true },
      });
      if (!serial || serial.status !== "IN_STOCK" || serial.currentLocationId !== row.locationId) {
        throw new Error(`Serial No ${serialNo} is not available to reverse this Delivery Return.`);
      }

      const ledgerValues = buildLedgerValues(createStoredQtyDecimal(1), "OUT");
      await tx.stockLedger.create({
        data: {
          movementDate: new Date(),
          movementType: "SR",
          movementDirection: "OUT",
          ...ledgerValues,
          batchNo: row.batchNo || serial.inventoryBatch?.batchNo || null,
          inventoryProductId: row.inventoryProductId,
          locationId: row.locationId,
          transactionId: null,
          transactionLineId: null,
          referenceNo: deliveryReturn.docNo,
          referenceText: `Cancel Delivery Return ${deliveryReturn.docNo}`,
          sourceType: "DELIVERY_RETURN_CANCEL",
          sourceId: deliveryReturn.id,
          remarks: `${reason} | SERIAL_NO=${serialNo}`,
        },
      });

      await tx.inventorySerial.update({
        where: { id: serial.id },
        data: { status: "OUT_OF_STOCK", currentLocationId: null },
      });
      continue;
    }

    const qty = toNumber(row.qtyIn || row.qty || 0);
    const balance = await getStockBalance(tx, row.inventoryProductId, row.locationId, { batchNo: row.batchNo || undefined });
    if (balance < qty && !config.allowNegativeStock) {
      throw new Error(`Insufficient stock to cancel Delivery Return. Current balance: ${balance}. Required: ${qty}.`);
    }

    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(qty), "OUT");
    await tx.stockLedger.create({
      data: {
        movementDate: new Date(),
        movementType: "SR",
        movementDirection: "OUT",
        ...ledgerValues,
        batchNo: row.batchNo,
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: deliveryReturn.docNo,
        referenceText: `Cancel Delivery Return ${deliveryReturn.docNo}`,
        sourceType: "DELIVERY_RETURN_CANCEL",
        sourceId: deliveryReturn.id,
        remarks: reason,
      },
    });
  }
}

export async function GET(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const transaction = await db.salesTransaction.findUnique({
      where: { id },
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, code: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        targetLinks: {
          include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } },
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
          },
        },
      },
    });

    if (!transaction || transaction.docType !== "DR") {
      return NextResponse.json({ ok: false, error: "Delivery Return not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, transaction: withCancellationDetails(transaction) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load delivery return." },
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
    const cancelReason = normalizeText(body.cancelReason);

    if (action !== "cancel") {
      return NextResponse.json({ ok: false, error: "Invalid Delivery Return action." }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: { cancelledByAdmin: { select: { id: true, name: true, email: true } } },
      });
      if (!current || current.docType !== "DR") throw new Error("Delivery Return not found.");
      if (current.status === "CANCELLED") throw new Error("This Delivery Return is already cancelled.");

      await reverseDeliveryReturnStock(tx, current, cancelReason || `Cancelled Delivery Return ${current.docNo}`);

      return tx.salesTransaction.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByAdminId: admin.id, cancelReason },
        include: { cancelledByAdmin: { select: { id: true, name: true, email: true } }, lines: true },
      });
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CANCEL",
      entityType: "DELIVERY_RETURN",
      entityId: updated.id,
      description: `Cancelled Delivery Return ${updated.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: withCancellationDetails(updated) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update delivery return." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
