import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockTransactionClient } from "@/components/admin-stock-transaction-client";

export default async function AdminStockIssuePage() {
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
        uomConversions: {
          orderBy: [{ uomCode: "asc" }],
          select: { id: true, uomCode: true, conversionRate: true },
        },
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
            <h1 className="mt-3 text-4xl font-bold">Stock Issue</h1>
            <p className="mt-4 max-w-3xl text-white/70">Record stock out from a selected location for tracked inventory items.</p>
          </div>
        </div>

        <div className="mt-10">
          <AdminStockTransactionClient
            transactionType="SI"
            title="Stock Issue"
            intro="Use Stock Issue to remove stock from a selected location for internal use, wastage, or manual stock-out movement."
            initialProducts={products.map((product) => ({
              id: product.id,
              code: product.code,
              description: product.description,
              baseUom: product.baseUom,
              unitCost: Number(product.unitCost ?? 0),
              batchTracking: product.batchTracking,
              serialNumberTracking: product.serialNumberTracking,
              uomConversions: Array.isArray(product.uomConversions)
                ? product.uomConversions.map((item) => ({
                    id: item.id,
                    uomCode: item.uomCode,
                    conversionRate: Number(item.conversionRate ?? 0),
                  }))
                : [],
            }))}
            initialLocations={locations}
          />
        </div>
      </div>
    </section>
  );
}
