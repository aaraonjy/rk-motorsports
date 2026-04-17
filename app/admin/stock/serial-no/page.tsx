import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSerialNoClient } from "@/components/admin-serial-no-client";

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export default async function AdminSerialNoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [products, locations, serials] = await Promise.all([
    db.inventoryProduct.findMany({
      where: { trackInventory: true },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, description: true, serialNumberTracking: true, isActive: true },
    }),
    db.stockLocation.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.inventorySerial.findMany({
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      take: 300,
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
        inventoryBatch: { select: { id: true, batchNo: true } },
        currentLocation: { select: { id: true, code: true, name: true } },
        transactionEntries: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          include: {
            transactionLine: {
              include: {
                transaction: { select: { transactionNo: true, transactionType: true, transactionDate: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const initialRows = serials.map((item) => {
    const lastEntry = item.transactionEntries[0];
    return {
      id: item.id,
      serialNo: item.serialNo,
      inventoryProductId: item.inventoryProductId,
      productCode: item.inventoryProduct.code,
      productDescription: item.inventoryProduct.description,
      batchNo: item.inventoryBatch?.batchNo ?? null,
      currentLocationId: item.currentLocationId,
      currentLocationLabel: item.currentLocation ? `${item.currentLocation.code} — ${item.currentLocation.name}` : "—",
      status: item.status,
      lastTransaction: lastEntry?.transactionLine.transaction.transactionNo ?? null,
      lastTransactionType: lastEntry?.transactionLine.transaction.transactionType ?? null,
      lastDate: formatDate(lastEntry?.transactionLine.transaction.transactionDate),
      createdAt: formatDate(item.createdAt),
      updatedAt: formatDate(item.updatedAt),
    };
  });

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Batch B</p>
          <h1 className="mt-3 text-4xl font-bold">Serial Number Tracking</h1>
          <p className="mt-4 max-w-3xl text-white/70">
            Trace serial movement, current location, last transaction, and full movement timeline without allowing manual edit or delete in V1.
          </p>
        </div>

        <div className="mt-10">
          <AdminSerialNoClient initialRows={initialRows} products={products} locations={locations} />
        </div>
      </div>
    </section>
  );
}
