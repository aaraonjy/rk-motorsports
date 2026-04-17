import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminBatchNoClient } from "@/components/admin-batch-no-client";

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type BatchRow = {
  id: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  batchNo: string;
  expiryDate: string | null;
  balance: number;
  locationSummary: string;
  linkedSerialCount: number;
  usageCount: number;
  isArchived: boolean;
  archivedAt: string | null;
  status: "ACTIVE" | "ZERO_BALANCE" | "ARCHIVED";
  createdAt: string | null;
  updatedAt: string | null;
};

export default async function AdminBatchNoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [products, locations, batches] = await Promise.all([
    db.inventoryProduct.findMany({
      where: { trackInventory: true },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, description: true, batchTracking: true, isActive: true },
    }),
    db.stockLocation.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.inventoryBatch.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
      },
    }),
  ]);

  const batchIds = batches.map((item) => item.id);
  const ledgerEntries = batchIds.length
    ? await db.stockLedger.findMany({
        where: {
          OR: batches.map((item) => ({ inventoryProductId: item.inventoryProductId, batchNo: item.batchNo })),
        },
        select: {
          inventoryProductId: true,
          batchNo: true,
          locationId: true,
          qtyIn: true,
          qtyOut: true,
        },
      })
    : [];

  const serialCounts = batchIds.length
    ? await db.inventorySerial.groupBy({
        by: ["inventoryBatchId"],
        where: { inventoryBatchId: { in: batchIds } },
        _count: { _all: true },
      })
    : [];

  const usageCounts = batchIds.length
    ? await db.stockTransactionLineSerial.groupBy({
        by: ["inventoryBatchId"],
        where: { inventoryBatchId: { in: batchIds } },
        _count: { _all: true },
      })
    : [];

  const balanceMap = new Map<string, { total: number; byLocation: Map<string, number> }>();
  for (const row of ledgerEntries) {
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

  const serialCountMap = new Map(serialCounts.map((row) => [row.inventoryBatchId || "", row._count._all]));
  const usageCountMap = new Map(usageCounts.map((row) => [row.inventoryBatchId || "", row._count._all]));
  const locationMap = new Map(locations.map((item) => [item.id, `${item.code} — ${item.name}`]));

  const initialRows: BatchRow[] = batches.map((item) => {
    const balanceInfo = balanceMap.get(`${item.inventoryProductId}__${item.batchNo}`);
    const totalBalance = balanceInfo?.total ?? 0;
    const linkedSerialCount = serialCountMap.get(item.id) ?? 0;
    const usageCount = usageCountMap.get(item.id) ?? 0;
    const locationLabels = Array.from(balanceInfo?.byLocation.entries() ?? [])
      .filter(([, balance]) => balance > 0)
      .map(([locationId]) => locationMap.get(locationId) || "Unknown")
      .sort((a, b) => a.localeCompare(b));

    const status: BatchRow["status"] = item.isArchived
      ? "ARCHIVED"
      : totalBalance <= 0
        ? "ZERO_BALANCE"
        : "ACTIVE";

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
      status,
      createdAt: formatDate(item.createdAt),
      updatedAt: formatDate(item.updatedAt),
    };
  });

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Batch B</p>
          <h1 className="mt-3 text-4xl font-bold">Batch Number Management</h1>
          <p className="mt-4 max-w-3xl text-white/70">
            Review current batch balances, location distribution, linked serial usage, and archive-safe cleanup from one traceability page.
          </p>
        </div>

        <div className="mt-10">
          <AdminBatchNoClient initialRows={initialRows} products={products} locations={locations} />
        </div>
      </div>
    </section>
  );
}
