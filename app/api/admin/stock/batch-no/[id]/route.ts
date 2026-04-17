import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function toRow(item: any, balance: number, linkedSerialCount: number, usageCount: number, locationSummary: string) {
  return {
    id: item.id,
    inventoryProductId: item.inventoryProductId,
    productCode: item.inventoryProduct.code,
    productDescription: item.inventoryProduct.description,
    batchNo: item.batchNo,
    expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
    balance: Math.round((balance + Number.EPSILON) * 100) / 100,
    locationSummary,
    linkedSerialCount,
    usageCount,
    isArchived: item.isArchived,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    status: item.isArchived ? "ARCHIVED" : balance <= 0 ? "ZERO_BALANCE" : "ACTIVE",
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function buildBatchState(batchId: string) {
  const batch = await db.inventoryBatch.findUnique({
    where: { id: batchId },
    include: { inventoryProduct: { select: { id: true, code: true, description: true } } },
  });
  if (!batch) throw new Error("Batch not found.");

  const [locations, ledger, serials, usageCount] = await Promise.all([
    db.stockLocation.findMany({ select: { id: true, code: true, name: true } }),
    db.stockLedger.findMany({
      where: { inventoryProductId: batch.inventoryProductId, batchNo: batch.batchNo },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      include: { location: { select: { id: true, code: true, name: true } } },
      take: 200,
    }),
    db.inventorySerial.findMany({
      where: { inventoryBatchId: batch.id },
      orderBy: [{ serialNo: "asc" }],
      include: { currentLocation: { select: { id: true, code: true, name: true } } },
      take: 200,
    }),
    db.stockTransactionLineSerial.count({ where: { inventoryBatchId: batch.id } }),
  ]);

  const locationLabelMap = new Map(locations.map((item) => [item.id, `${item.code} — ${item.name}`]));
  const locationBalances = new Map<string, number>();
  let balance = 0;
  for (const entry of ledger) {
    const movement = Number(entry.qtyIn ?? 0) - Number(entry.qtyOut ?? 0);
    balance += movement;
    locationBalances.set(entry.locationId, (locationBalances.get(entry.locationId) ?? 0) + movement);
  }

  const linkedSerialCount = serials.length;
  const locationSummary = Array.from(locationBalances.entries()).filter(([, qty]) => qty > 0).map(([id]) => locationLabelMap.get(id) || "Unknown").join(", ");

  return {
    batch,
    balance,
    linkedSerialCount,
    usageCount,
    locations: Array.from(locationBalances.entries()).filter(([, qty]) => qty !== 0).map(([locationId, qty]) => ({ locationId, locationLabel: locationLabelMap.get(locationId) || "Unknown", balance: Math.round((qty + Number.EPSILON) * 100) / 100 })).sort((a, b) => a.locationLabel.localeCompare(b.locationLabel)),
    serials: serials.map((item) => ({ id: item.id, serialNo: item.serialNo, status: item.status, currentLocationLabel: item.currentLocation ? `${item.currentLocation.code} — ${item.currentLocation.name}` : "—" })),
    history: ledger.map((item) => ({ id: item.id, movementDate: item.movementDate.toISOString(), movementType: item.movementType, movementDirection: item.movementDirection, qty: Number(item.qty ?? 0), locationLabel: item.location ? `${item.location.code} — ${item.location.name}` : "—", referenceNo: item.referenceNo ?? null, remarks: item.remarks ?? null })),
    row: toRow(batch, balance, linkedSerialCount, usageCount, locationSummary),
  };
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const state = await buildBatchState(id);
    return NextResponse.json({ ok: true, detail: { batch: state.row, locations: state.locations, serials: state.serials, history: state.history } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load batch detail." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "restore" ? "restore" : body?.action === "archive" ? "archive" : null;
    if (!action) {
      return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
    }

    const state = await buildBatchState(id);

    if (action === "archive") {
      if (state.row.balance !== 0) {
        return NextResponse.json({ ok: false, error: "Only zero-balance batch can be archived." }, { status: 400 });
      }
      if (state.linkedSerialCount > 0) {
        return NextResponse.json({ ok: false, error: "Batch still has linked serial numbers and cannot be archived." }, { status: 400 });
      }
      await db.inventoryBatch.update({ where: { id }, data: { isArchived: true, archivedAt: new Date(), archivedByAdminId: admin.id } });
    } else {
      await db.inventoryBatch.update({ where: { id }, data: { isArchived: false, archivedAt: null, archivedByAdminId: null } });
    }

    const nextState = await buildBatchState(id);
    return NextResponse.json({ ok: true, batch: nextState.row });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update batch." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}
