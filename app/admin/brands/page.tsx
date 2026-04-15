import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/admin-master-list-client";

export default async function AdminBrandsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const items = await db.productBrand.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

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
          />
        </div>
      </div>
    </section>
  );
}
