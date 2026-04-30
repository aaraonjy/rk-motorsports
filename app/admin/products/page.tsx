import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminProductMasterClient } from "@/components/admin-product-master-client";

export default async function AdminProductsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const pageSize = 10;

  const [products, productTotal, locations, groups, subGroups, brands] = await Promise.all([
    db.inventoryProduct.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      take: pageSize,
      include: {
        defaultLocation: { select: { id: true, code: true, name: true } },
        productGroup: { select: { id: true, code: true, name: true, isActive: true } },
        productSubGroup: { select: { id: true, code: true, name: true, groupId: true, isActive: true } },
        productBrand: { select: { id: true, code: true, name: true, isActive: true } },
      },
    }),
    db.inventoryProduct.count(),
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
              isAssemblyItem: product.isAssemblyItem ?? false,
              isActive: product.isActive,
              defaultLocationId: product.defaultLocationId,
              defaultLocationLabel: product.defaultLocation ? `${product.defaultLocation.code} — ${product.defaultLocation.name}` : null,
              uomConversions: [],
              createdAt: product.createdAt.toISOString(),
              updatedAt: product.updatedAt.toISOString(),
            }))}
            initialPagination={{ page: 1, pageSize, total: productTotal, totalPages: Math.max(1, Math.ceil(productTotal / pageSize)) }}
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
