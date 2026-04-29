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

async function reverseCreditNoteStock(tx: Prisma.TransactionClient, creditNote: any, reason: string) {
  const creditLedgerRows = await tx.stockLedger.findMany({
    where: {
      sourceType: "CREDIT_NOTE",
      sourceId: creditNote.id,
      movementDirection: "IN",
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (creditLedgerRows.length === 0) return;

  const config = await tx.stockConfiguration.findUnique({ where: { id: "default" } });
  if (!config?.stockModuleEnabled) throw new Error("Stock module is disabled.");

  await acquireStockMutationLocks(
    tx,
    creditLedgerRows.map((row) => {
      const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
      return {
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        batchNo: row.batchNo,
        serialNos: serialMatch ? [serialMatch[1].trim()] : [],
      };
    })
  );

  for (const row of creditLedgerRows) {
    const serialMatch = String(row.remarks || "").match(/SERIAL_NO=([^|]+)/);
    const serialNo = serialMatch ? serialMatch[1].trim() : "";

    if (serialNo) {
      const serialRecord = await tx.inventorySerial.findUnique({
        where: { inventoryProductId_serialNo: { inventoryProductId: row.inventoryProductId, serialNo } },
        include: { inventoryBatch: true },
      });

      if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== row.locationId) {
        throw new Error(`Serial No ${serialNo} is not available to reverse this Credit Note.`);
      }

      const ledgerValues = buildLedgerValues(createStoredQtyDecimal(1), "OUT");
      await tx.stockLedger.create({
        data: {
          movementDate: new Date(),
          movementType: "SI",
          movementDirection: "OUT",
          ...ledgerValues,
          batchNo: row.batchNo || serialRecord.inventoryBatch?.batchNo || null,
          inventoryProductId: row.inventoryProductId,
          locationId: row.locationId,
          transactionId: null,
          transactionLineId: null,
          referenceNo: creditNote.docNo,
          referenceText: `Cancel Credit Note ${creditNote.docNo}`,
          sourceType: "CREDIT_NOTE_CANCEL",
          sourceId: creditNote.id,
          remarks: `${reason} | SERIAL_NO=${serialNo}`,
        },
      });

      await tx.inventorySerial.update({
        where: { id: serialRecord.id },
        data: { status: "OUT_OF_STOCK", currentLocationId: null },
      });

      continue;
    }

    const qty = toNumber(row.qtyIn || row.qty || 0);
    const balance = await getStockBalance(tx, row.inventoryProductId, row.locationId, { batchNo: row.batchNo || undefined });
    if (balance < qty && !config.allowNegativeStock) {
      throw new Error(`Insufficient stock to cancel Credit Note. Current balance: ${balance}. Required: ${qty}.`);
    }

    const ledgerValues = buildLedgerValues(createStoredQtyDecimal(qty), "OUT");
    await tx.stockLedger.create({
      data: {
        movementDate: new Date(),
        movementType: "SI",
        movementDirection: "OUT",
        ...ledgerValues,
        batchNo: row.batchNo,
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        transactionId: null,
        transactionLineId: null,
        referenceNo: creditNote.docNo,
        referenceText: `Cancel Credit Note ${creditNote.docNo}`,
        sourceType: "CREDIT_NOTE_CANCEL",
        sourceId: creditNote.id,
        remarks: reason,
      },
    });
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;

    const transaction = await db.salesTransaction.findUnique({
      where: { id },
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            inventoryProduct: { select: { id: true, itemType: true } },
            targetLineLinks: {
              include: {
                sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
                sourceLine: { select: { id: true, lineNo: true, productCode: true, productDescription: true } },
              },
            },
          },
        },
      },
    });

    if (!transaction || transaction.docType !== "CN") {
      return NextResponse.json({ ok: false, error: "Credit Note not found." }, { status: 404 });
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
      { ok: false, error: error instanceof Error ? error.message : "Unable to load credit note." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toUpperCase();

    if (action !== "CANCEL") {
      return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
    }

    const cancelReason = normalizeText(body.cancelReason);
    if (!cancelReason) {
      return NextResponse.json({ ok: false, error: "Cancel reason is required." }, { status: 400 });
    }

    const cancelled = await db.$transaction(async (tx) => {
      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          lines: {
            orderBy: { lineNo: "asc" },
            include: { inventoryProduct: { select: { id: true, itemType: true } } },
          },
        },
      });

      if (!current || current.docType !== "CN") throw new Error("Credit Note not found.");
      if (current.status === "CANCELLED") throw new Error("Credit Note has already been cancelled.");

      await reverseCreditNoteStock(tx, current, cancelReason);

      const updated = await tx.salesTransaction.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelReason,
          cancelledAt: normalizeDate(new Date().toISOString().slice(0, 10)),
          cancelledByAdminId: admin.id,
        },
        include: {
          createdByAdmin: { select: { id: true, name: true, email: true } },
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      });

      return updated;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "SALES",
      action: "CANCEL",
      entityType: "SALES_CREDIT_NOTE",
      entityId: cancelled.id,
      description: `Cancelled Credit Note ${cancelled.docNo}.`,
    });

    return NextResponse.json({ ok: true, transaction: withCancellationDetails(cancelled) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to cancel credit note." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}
