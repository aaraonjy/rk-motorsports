
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminDebitNoteClient } from "@/components/sales/admin-debit-note-client";

export default async function AdminDebitNotePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [products, locations, stockConfig, taxConfig, taxCodes, agents, projects, departments] = await Promise.all([
    db.inventoryProduct.findMany({
      where: {
        isActive: true,
        OR: [
          { itemType: "STOCK_ITEM", trackInventory: true },
          { itemType: "SERVICE_ITEM" },
          { itemType: "NON_STOCK_ITEM" },
        ],
      },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        baseUom: true,
        sellingPrice: true,
        itemType: true,
        trackInventory: true,
        batchTracking: true,
        serialNumberTracking: true,
        isAssemblyItem: true,
        uomConversions: {
          select: { id: true, uomCode: true, conversionRate: true },
          orderBy: [{ uomCode: "asc" }],
        },
      },
    }),
    db.stockLocation.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.stockConfiguration.findUnique({ where: { id: "default" } }),
    db.taxConfiguration.findUnique({ where: { id: "default" } }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, description: true, rate: true, calculationMethod: true },
    }),
    db.agent.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.project.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.department.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, projectId: true, isActive: true } }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <AdminDebitNoteClient
          initialProducts={products.map((product) => ({
            id: product.id,
            code: product.code,
            description: product.description,
            baseUom: product.baseUom,
            sellingPrice: Number(product.sellingPrice ?? 0),
            itemType: product.itemType,
            trackInventory: product.trackInventory,
            batchTracking: product.batchTracking,
            serialNumberTracking: product.serialNumberTracking,
            isAssemblyItem: product.isAssemblyItem,
            uomConversions: product.uomConversions.map((item) => ({
              id: item.id,
              uomCode: item.uomCode,
              conversionRate: Number(item.conversionRate ?? 0),
            })),
          }))}
          initialLocations={locations}
          defaultLocationId={stockConfig?.defaultLocationId || locations[0]?.id || ""}
          initialTaxCodes={taxCodes.map((taxCode) => ({
            id: taxCode.id,
            code: taxCode.code,
            description: taxCode.description,
            rate: Number(taxCode.rate ?? 0),
            calculationMethod: taxCode.calculationMethod,
          }))}
          defaultAdminTaxCodeId={taxConfig?.defaultAdminTaxCodeId || ""}
          initialAgents={agents}
          initialProjects={projects}
          initialDepartments={departments}
        />
      </div>
    </section>
  );
}
