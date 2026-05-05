import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function toPageNumber(value: string | null) {
  const parsed = Number(value || "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function toPageSize(value: string | null) {
  const parsed = Number(value || "10");
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(100, Math.floor(parsed));
}

function roundQty(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function isDropdownRequest(searchParams: URLSearchParams) {
  return Boolean(searchParams.get("inventoryProductId") || searchParams.get("direction"));
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const inventoryProductId =
      searchParams.get("inventoryProductId")?.trim() ||
      searchParams.get("productId")?.trim() ||
      undefined;
    const keyword = searchParams.get("q")?.trim() || searchParams.get("batchNo")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "ALL";
    const locationId = searchParams.get("locationId")?.trim() || "ALL";
    const direction = (searchParams.get("direction")?.trim() || "").toLowerCase();
    const includeZeroBalance = searchParams.get("includeZeroBalance") === "1" || searchParams.get("includeZeroBalance") === "true";
    const zeroBalanceOnly = searchParams.get("zeroBalanceOnly") === "true";
    const page = toPageNumber(searchParams.get("page"));
    const pageSize = toPageSize(searchParams.get("pageSize"));
    const dropdownMode = isDropdownRequest(searchParams);

    const batches = await db.inventoryBatch.findMany({
      where: {
        ...(inventoryProductId && inventoryProductId !== "ALL" ? { inventoryProductId } : {}),
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
      take: dropdownMode ? 500 : 800,
    });

    const locations = await db.stockLocation.findMany({ select: { id: true, code: true, name: true } });
    const locationMap = new Map(locations.map((item) => [item.id, `${item.code} — ${item.name}`]));

    const rows = await Promise.all(
      batches.map(async (item) => {
        const [ledger, linkedSerialCount, usageCount] = await Promise.all([
          db.stockLedger.findMany({
            where: {
              inventoryProductId: item.inventoryProductId,
              batchNo: item.batchNo,
              ...(locationId && locationId !== "ALL" ? { locationId } : {}),
            },
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

        const roundedBalance = roundQty(balance);
        const locationLabels = Array.from(byLocation.entries())
          .filter(([, qty]) => qty > 0)
          .map(([id]) => locationMap.get(id) || "Unknown")
          .sort((a, b) => String(a).localeCompare(String(b)));

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
      if (status && status !== "ALL" && item.status !== status) return false;
      if (zeroBalanceOnly && item.balance > 0) return false;

      // For outbound usage (DO, Stock Issue, DN, etc.), only batches with actual stock balance at
      // the selected location should be selectable.
      if (direction === "outbound" && !includeZeroBalance && item.balance <= 0) return false;

      // For listing/master page, keep the existing default of hiding zero balance unless requested.
      // For inbound usage (SR/GRN/PI), allow existing batch numbers to appear even if balance is 0,
      // so users can receive additional stock into an existing batch.
      if (!dropdownMode && !includeZeroBalance && item.balance <= 0) return false;
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pagedRows = dropdownMode ? filtered : filtered.slice(start, start + pageSize);

    return NextResponse.json(
      {
        ok: true,
        rows: pagedRows,
        items: pagedRows,
        pagination: {
          page: safePage,
          pageSize,
          total,
          totalPages,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load batch data." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500, headers: NO_STORE_HEADERS }
    );
  }
}
