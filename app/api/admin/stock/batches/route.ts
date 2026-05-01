import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function toPageNumber(value: string | null) {
  const parsed = Number(value || "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function toPageSize(value: string | null) {
  const parsed = Number(value || "10");
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(100, Math.floor(parsed));
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId")?.trim() || undefined;
    const keyword = searchParams.get("q")?.trim() || searchParams.get("batchNo")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "ALL";
    const locationId = searchParams.get("locationId")?.trim() || "ALL";
    const includeZeroBalance = searchParams.get("includeZeroBalance") === "1";
    const page = toPageNumber(searchParams.get("page"));
    const pageSize = toPageSize(searchParams.get("pageSize"));

    const batches = await db.inventoryBatch.findMany({
      where: {
        ...(productId && productId !== "ALL" ? { inventoryProductId: productId } : {}),
        ...(keyword
          ? {
              OR: [
                { batchNo: { contains: keyword, mode: "insensitive" } },
                { inventoryProduct: { code: { contains: keyword, mode: "insensitive" } } },
                { inventoryProduct: { description: { contains: keyword, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
      },
      take: 800,
    });

    const locations = await db.stockLocation.findMany({ select: { id: true, code: true, name: true } });
    const locationMap = new Map(locations.map((item) => [item.id, `${item.code} — ${item.name}`]));

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

        const roundedBalance = Math.round((balance + Number.EPSILON) * 100) / 100;
        const locationLabels = Array.from(byLocation.entries())
          .filter(([, qty]) => qty > 0)
          .map(([id]) => locationMap.get(id) || "Unknown")
          .sort((a, b) => a.localeCompare(b));

        return {
          id: item.id,
          inventoryProductId: item.inventoryProductId,
          productCode: item.inventoryProduct.code,
          productDescription: item.inventoryProduct.description,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
          balance: roundedBalance,
          locationSummary: locationLabels.join(", "),
          linkedSerialCount,
          usageCount,
          isArchived: item.isArchived,
          archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
          status: item.isArchived ? "ARCHIVED" : roundedBalance <= 0 ? "ZERO_BALANCE" : "ACTIVE",
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        };
      })
    );

    const filtered = rows.filter((item) => {
      if (!includeZeroBalance && item.balance <= 0) return false;
      if (locationId && locationId !== "ALL" && !item.locationSummary.includes(locationMap.get(locationId) || "")) return false;
      if (status && status !== "ALL" && item.status !== status) return false;
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pagedRows = filtered.slice(start, start + pageSize);

    return NextResponse.json({
      ok: true,
      rows: pagedRows,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load batch data." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
