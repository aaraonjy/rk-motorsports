import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/admin-master-list-client";

const PAGE_SIZE = 10;

export default async function AdminBrandsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [total, items] = await Promise.all([
    db.productBrand.count(),
    db.productBrand.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <h1 className="text-4xl font-bold">Brand</h1>
        <p className="mt-4 max-w-3xl text-white/70">
          Manage brand master data for Product Master validation.
        </p>

        <div className="mt-10">
          <AdminMasterListClient
            title="Brand"
            subtitle="Master Data"
            apiBase="/api/admin/brands"
            initialItems={items.map((item) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              isActive: item.isActive,
            }))}
            initialPagination={{
              page: 1,
              pageSize: PAGE_SIZE,
              total,
              totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            }}
          />
        </div>
      </div>
    </section>
  );
}
