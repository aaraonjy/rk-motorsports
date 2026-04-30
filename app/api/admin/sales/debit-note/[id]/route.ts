
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireStockMutationLocks,
  buildLedgerValues,
  createStoredQtyDecimal,
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

function extractSerialNoFromRemarks(value: string | null | undefined) {
  const match = String(value || "").match(/SERIAL_NO=([^|]+)/);
  return match ? match[1].trim() : "";
}

async function reverseDebitNoteStock(tx: Prisma.TransactionClient, debitNote: any, reason: string) {
  const debitLedgerRows = await tx.stockLedger.findMany({
    where: {
      sourceType: "DEBIT_NOTE",
      sourceId: debitNote.id,
      movementDirection: "OUT",
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (debitLedgerRows.length === 0) return;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireStockMutationLocks(
    tx,
    debitLedgerRows.map((row) => {
      const serialNo = extractSerialNoFromRemarks(row.remarks);
      return {
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        batchNo: row.batchNo,
        serialNos: serialNo ? [serialNo] : [],
      };
    })
  );

  for (const row of debitLedgerRows) {
    const serialNo = extractSerialNoFromRemarks(row.remarks);
    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(row.qty), "IN");

    await tx.stockLedger.create({
      data: {
        movementDate: new Date(),
        movementType: "SR",
        movementDirection: "IN",
        ...ledgerValues,
        batchNo: row.batchNo,
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: debitNote.docNo,
        referenceText: `Reverse Debit Note ${debitNote.docNo}`,
        sourceType: "DEBIT_NOTE_REVERSAL",
        sourceId: debitNote.id,
        remarks: `${reason || "Debit Note cancelled"}${serialNo ? ` | SERIAL_NO=${serialNo}` : ""}`,
      },
    });

    if (serialNo) {
      const serialRecord = await tx.inventorySerial.findUnique({
        where: {
          inventoryProductId_serialNo: {
            inventoryProductId: row.inventoryProductId,
            serialNo,
          },
        },
      });

      if (serialRecord) {
        await tx.inventorySerial.update({
          where: { id: serialRecord.id },
          data: { status: "IN_STOCK", currentLocationId: row.locationId },
        });
      }
    }
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
          include: {
            sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
          },
        },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            inventoryProduct: { select: { itemType: true, trackInventory: true, batchTracking: true, serialNumberTracking: true } },
          },
        },
      },
    });

    if (!transaction || transaction.docType !== "DN") {
      return NextResponse.json({ ok: false, error: "Debit Note not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      transaction: {
        ...withCancellationDetails(transaction),
        sourceLinks: transaction.targetLinks.map((link) => ({ sourceTransaction: link.sourceTransaction })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load debit note." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    if (body.action !== "CANCEL") {
      return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
    }

    const cancelReason = normalizeText(body.cancelReason);
    if (!cancelReason) {
      return NextResponse.json({ ok: false, error: "Cancel reason is required." }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      });

      if (!current || current.docType !== "DN") throw new Error("Debit Note not found.");
      if (current.status === "CANCELLED") throw new Error("Debit Note is already cancelled.");

      await reverseDebitNoteStock(tx, current, cancelReason);

      const cancelled = await tx.salesTransaction.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelReason,
          cancelledAt: new Date(),
          cancelledByAdminId: admin.id,
        },
        include: {
          createdByAdmin: { select: { id: true, name: true, email: true } },
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      });

      await createAuditLogFromRequest({
        req,
        user: admin,
        module: "SALES",
        action: "CANCEL",
        entityType: "DEBIT_NOTE",
        entityId: current.id,
        description: `Cancelled Debit Note ${current.docNo}. Reason: ${cancelReason}`,
      });

      return cancelled;
    });

    return NextResponse.json({
      ok: true,
      transaction: {
        ...withCancellationDetails(updated),
        sourceLinks: updated.targetLinks.map((link) => ({ sourceTransaction: link.sourceTransaction })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update debit note." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
