import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId")?.trim() || undefined;
    const batchNo = searchParams.get("batchNo")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;
    const zeroBalanceOnly = searchParams.get("zeroBalanceOnly") === "true";

    const batches = await db.inventoryBatch.findMany({
      where: {
        ...(productId ? { inventoryProductId: productId } : {}),
        ...(batchNo ? { batchNo: { contains: batchNo, mode: "insensitive" } } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
      },
      take: 400,
    });

    const locationMap = new Map((await db.stockLocation.findMany({ select: { id: true, code: true, name: true } })).map((item) => [item.id, `${item.code} — ${item.name}`]));
    const rows = await Promise.all(
      batches.map(async (item) => {
        const [ledger, linkedSerialCount, usageCount] = await Promise.all([
          db.stockLedger.findMany({
            where: { inventoryProductId: item.inventoryProductId, batchNo: item.batchNo },
            select: { locationId: true, qtyIn: true, qtyOut: true },
          }),
          db.inventorySerial.count({ where: { inventoryBatchId: item.id } }),
          db.stockTransactionLineSerial.count({ where: { inventoryBatchId: item.id } }),
        ]);

        const byLocation = new Map<string, number>();
        let balance = 0;
        for (const entry of ledger) {
          const movement = Number(entry.qtyIn ?? 0) - Number(entry.qtyOut ?? 0);
          balance += movement;
          byLocation.set(entry.locationId, (byLocation.get(entry.locationId) ?? 0) + movement);
        }
        const locationLabels = Array.from(byLocation.entries()).filter(([, qty]) => qty > 0).map(([id]) => locationMap.get(id) || "Unknown").join(", ");
        const row = {
          id: item.id,
          inventoryProductId: item.inventoryProductId,
          productCode: item.inventoryProduct.code,
          productDescription: item.inventoryProduct.description,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
          balance: Math.round((balance + Number.EPSILON) * 100) / 100,
          locationSummary: locationLabels,
          linkedSerialCount,
          usageCount,
          isArchived: item.isArchived,
          archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
          status: item.isArchived ? "ARCHIVED" : balance <= 0 ? "ZERO_BALANCE" : "ACTIVE",
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        };
        return row;
      })
    );

    const filtered = rows.filter((item) => {
      if (locationId && !item.locationSummary.includes(locationMap.get(locationId) || "")) return false;
      if (status && status !== "ALL" && item.status !== status) return false;
      if (zeroBalanceOnly && item.balance > 0) return false;
      return true;
    });

    return NextResponse.json({ ok: true, items: filtered });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load batch data." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}
