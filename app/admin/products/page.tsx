
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminProductMasterClient } from "@/components/admin-product-master-client";

export default async function AdminProductsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [products, locations, groups, subGroups, brands] = await Promise.all([
    db.inventoryProduct.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      include: {
        defaultLocation: { select: { id: true, code: true, name: true } },
        productGroup: { select: { id: true, code: true, name: true, isActive: true } },
        productSubGroup: { select: { id: true, code: true, name: true, groupId: true, isActive: true } },
        productBrand: { select: { id: true, code: true, name: true, isActive: true } },
      },
    }),
    db.stockLocation.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.productGroup.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.productSubGroup.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, groupId: true, isActive: true },
    }),
    db.productBrand.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div>
          <h1 className="text-4xl font-bold">Product Master</h1>
          <p className="mt-4 max-w-3xl text-white/70">
            Manage the new custom-order product master separately from the existing tuning package catalog.
          </p>
        </div>

        <div className="mt-10">
          <AdminProductMasterClient
            initialProducts={products.map((product) => ({
              id: product.id,
              code: product.code,
              description: product.description,
              group: product.group,
              subGroup: product.subGroup,
              brand: product.brand,
              groupId: product.groupId,
              subGroupId: product.subGroupId,
              brandId: product.brandId,
              itemType: product.itemType,
              baseUom: product.baseUom,
              unitCost: Number(product.unitCost ?? 0),
              sellingPrice: Number(product.sellingPrice ?? 0),
              trackInventory: product.trackInventory,
              serialNumberTracking: product.serialNumberTracking,
              batchTracking: product.batchTracking,
              isActive: product.isActive,
              defaultLocationId: product.defaultLocationId,
              defaultLocationLabel: product.defaultLocation ? `${product.defaultLocation.code} — ${product.defaultLocation.name}` : null,
              createdAt: product.createdAt.toISOString(),
              updatedAt: product.updatedAt.toISOString(),
            }))}
            locations={locations}
            productGroups={groups}
            productSubGroups={subGroups}
            productBrands={brands}
          />
        </div>
      </div>
    </section>
  );
}
