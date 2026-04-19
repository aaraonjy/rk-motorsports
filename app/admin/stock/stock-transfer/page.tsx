import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockTransactionClient } from "@/components/admin-stock-transaction-client";

export default async function AdminStockTransferPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [products, locations] = await Promise.all([
    db.inventoryProduct.findMany({
      where: { isActive: true, trackInventory: true },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        baseUom: true,
        unitCost: true,
        batchTracking: true,
        serialNumberTracking: true,
      },
    }),
    db.stockLocation.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="mt-3 text-4xl font-bold">Stock Transfer</h1>
            <p className="mt-4 max-w-3xl text-white/70">Transfer stock between source and destination locations for tracked inventory items.</p>
          </div>
        </div>

        <div className="mt-10">
          <AdminStockTransactionClient
            transactionType="ST"
            title="Stock Transfer"
            intro="Use Stock Transfer to move inventory from one active location to another while preserving full stock ledger traceability."
            initialProducts={products.map((product) => ({
              id: product.id,
              code: product.code,
              description: product.description,
              baseUom: product.baseUom,
              unitCost: Number(product.unitCost ?? 0),
              batchTracking: product.batchTracking,
              serialNumberTracking: product.serialNumberTracking,
            }))}
            initialLocations={locations}
          />
        </div>
      </div>
    </section>
  );
}
