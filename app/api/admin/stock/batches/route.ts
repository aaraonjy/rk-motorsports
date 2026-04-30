import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function loadBatchList(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawPage = Number(searchParams.get("page") || "1");
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = 10;
  const productId = searchParams.get("productId")?.trim() || "ALL";
  const locationId = searchParams.get("locationId")?.trim() || "ALL";
  const status = searchParams.get("status")?.trim() || "ALL";
  const q = searchParams.get("q")?.trim() || "";
  const zeroBalanceOnly = searchParams.get("zeroBalanceOnly") === "1" || searchParams.get("zeroBalanceOnly") === "true";

  const batches = await db.inventoryBatch.findMany({
    where: {
      ...(productId !== "ALL" ? { inventoryProductId: productId } : {}),
      ...(q ? { batchNo: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: { inventoryProduct: { select: { id: true, code: true, description: true } } },
  });

  const batchIds = batches.map((item) => item.id);
  const [locations, ledgerEntries, serialCounts, usageCounts] = await Promise.all([
    db.stockLocation.findMany({ select: { id: true, code: true, name: true } }),
    batchIds.length
      ? db.stockLedger.findMany({
          where: { OR: batches.map((item) => ({ inventoryProductId: item.inventoryProductId, batchNo: item.batchNo })) },
          select: { inventoryProductId: true, batchNo: true, locationId: true, qtyIn: true, qtyOut: true },
        })
      : Promise.resolve([]),
    batchIds.length
      ? db.inventorySerial.groupBy({ by: ["inventoryBatchId"], where: { inventoryBatchId: { in: batchIds } }, _count: { _all: true } })
      : Promise.resolve([]),
    batchIds.length
      ? db.stockTransactionLineSerial.groupBy({ by: ["inventoryBatchId"], where: { inventoryBatchId: { in: batchIds } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);

  const balanceMap = new Map<string, { total: number; byLocation: Map<string, number> }>();
  for (const row of ledgerEntries as any[]) {
    const key = `${row.inventoryProductId}__${row.batchNo || ""}`;
    const current = balanceMap.get(key) ?? { total: 0, byLocation: new Map<string, number>() };
    const qtyIn = Number(row.qtyIn ?? 0);
    const qtyOut = Number(row.qtyOut ?? 0);
    const movement = Math.round((qtyIn - qtyOut + Number.EPSILON) * 100) / 100;
    current.total = Math.round((current.total + movement + Number.EPSILON) * 100) / 100;
    const locationBalance = current.byLocation.get(row.locationId) ?? 0;
    current.byLocation.set(row.locationId, Math.round((locationBalance + movement + Number.EPSILON) * 100) / 100);
    balanceMap.set(key, current);
  }

  const serialCountMap = new Map((serialCounts as any[]).map((row) => [row.inventoryBatchId || "", row._count._all]));
  const usageCountMap = new Map((usageCounts as any[]).map((row) => [row.inventoryBatchId || "", row._count._all]));
  const locationMap = new Map(locations.map((item) => [item.id, `${item.code} — ${item.name}`]));

  const mapped = batches.map((item) => {
    const balanceInfo = balanceMap.get(`${item.inventoryProductId}__${item.batchNo}`);
    const totalBalance = balanceInfo?.total ?? 0;
    const linkedSerialCount = serialCountMap.get(item.id) ?? 0;
    const usageCount = usageCountMap.get(item.id) ?? 0;
    const locationLabels = Array.from(balanceInfo?.byLocation.entries() ?? [])
      .filter(([, balance]) => balance > 0)
      .filter(([locId]) => locationId === "ALL" || locId === locationId)
      .map(([locId]) => locationMap.get(locId) || "Unknown")
      .sort((a, b) => a.localeCompare(b));

    const statusValue = item.isArchived ? "ARCHIVED" : totalBalance <= 0 ? "ZERO_BALANCE" : "ACTIVE";

    return {
      id: item.id,
      inventoryProductId: item.inventoryProductId,
      productCode: item.inventoryProduct.code,
      productDescription: item.inventoryProduct.description,
      batchNo: item.batchNo,
      expiryDate: formatDate(item.expiryDate),
      balance: totalBalance,
      locationSummary: locationLabels.join(", "),
      linkedSerialCount,
      usageCount,
      isArchived: item.isArchived,
      archivedAt: formatDate(item.archivedAt),
      status: statusValue,
      createdAt: formatDate(item.createdAt),
      updatedAt: formatDate(item.updatedAt),
    };
  }).filter((item) => {
    if (locationId !== "ALL" && !item.locationSummary) return false;
    if (status !== "ALL" && item.status !== status) return false;
    if (zeroBalanceOnly && item.status !== "ZERO_BALANCE") return false;
    return true;
  });

  const total = mapped.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = mapped.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ ok: true, rows: items, pagination: { page, pageSize, total, totalPages } });
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode")?.trim();
    if (mode === "list") return loadBatchList(req);

    const inventoryProductId = searchParams.get("inventoryProductId")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;
    const direction = searchParams.get("direction")?.trim() || "inbound";
    const q = searchParams.get("q")?.trim().toLowerCase() || undefined;

    if (!inventoryProductId) {
      const items = await db.inventoryBatch.findMany({
        orderBy: [{ createdAt: "desc" }],
        select: { id: true, inventoryProductId: true, batchNo: true, expiryDate: true },
        take: 500,
      });

      return NextResponse.json({
        ok: true,
        items: items.map((item) => ({ ...item, expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null, balance: null })),
      });
    }

    if (direction === "outbound" && locationId) {
      const grouped = await db.stockLedger.groupBy({
        by: ["batchNo"],
        where: { inventoryProductId, locationId, batchNo: { not: null } },
        _sum: { qtyIn: true, qtyOut: true },
      });

      const positiveRows = grouped
        .map((row) => ({ batchNo: row.batchNo, balance: Math.round((Number(row._sum.qtyIn ?? 0) - Number(row._sum.qtyOut ?? 0) + Number.EPSILON) * 100) / 100 }))
        .filter((row) => !!row.batchNo && row.balance > 0);

      const batchNos = positiveRows.map((row) => row.batchNo!).filter((value) => !q || value.toLowerCase().includes(q));
      const batches = batchNos.length
        ? await db.inventoryBatch.findMany({ where: { inventoryProductId, batchNo: { in: batchNos } }, select: { id: true, inventoryProductId: true, batchNo: true, expiryDate: true } })
        : [];

      const batchMap = new Map(batches.map((item) => [item.batchNo, item]));
      const items = positiveRows
        .filter((row) => batchMap.has(row.batchNo!))
        .sort((a, b) => String(a.batchNo).localeCompare(String(b.batchNo)))
        .map((row) => {
          const batch = batchMap.get(row.batchNo!)!;
          return { id: batch.id, inventoryProductId: batch.inventoryProductId, batchNo: batch.batchNo, expiryDate: batch.expiryDate ? batch.expiryDate.toISOString().slice(0, 10) : null, balance: row.balance };
        });

      return NextResponse.json({ ok: true, items });
    }

    const items = await db.inventoryBatch.findMany({
      where: { inventoryProductId, ...(q ? { batchNo: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, inventoryProductId: true, batchNo: true, expiryDate: true },
      take: 200,
    });

    return NextResponse.json({ ok: true, items: items.map((item) => ({ ...item, expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null, balance: null })) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load batches." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
