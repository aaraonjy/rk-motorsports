import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockAssemblyClient } from "@/components/admin-stock-assembly-client";

export default async function AdminStockAssemblyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [finishedGoods, allProducts, locations] = await Promise.all([
    db.inventoryProduct.findMany({
      where: {
        isActive: true,
        trackInventory: true,
        itemType: "STOCK_ITEM",
        isAssemblyItem: true,
      },
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
    db.inventoryProduct.findMany({
      where: {
        isActive: true,
        trackInventory: true,
        itemType: "STOCK_ITEM",
      },
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
            <h1 className="mt-3 text-4xl font-bold">Stock Assembly</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Create finished goods by consuming component stock based on predefined assembly templates. This will deduct component quantities and add the assembled product into inventory with full traceability.
            </p>
          </div>
        </div>

        <div className="mt-10">
          <AdminStockAssemblyClient
            finishedGoods={finishedGoods.map((product) => ({
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
            allProducts={allProducts.map((product) => ({
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
            locations={locations}
          />
        </div>
      </div>
    </section>
  );
}
