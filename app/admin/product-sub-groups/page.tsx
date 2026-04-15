import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/admin-master-list-client";

export default async function AdminProductSubGroupsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [items, groups] = await Promise.all([
    db.productSubGroup.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      include: {
        group: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    }),
    db.productGroup.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <h1 className="text-4xl font-bold">Product Sub-Group</h1>
        <p className="mt-4 max-w-3xl text-white/70">
          Manage product sub-group master data for Product Master validation.
        </p>

        <div className="mt-10">
          <AdminMasterListClient
            title="Product Sub-Group"
            subtitle="Master Data"
            apiBase="/api/admin/product-sub-groups"
            requireGroup={true}
            groups={groups}
            initialItems={items.map((item) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              isActive: item.isActive,
              groupId: item.groupId,
              groupLabel: `${item.group.code} — ${item.group.name}`,
            }))}
          />
        </div>
      </div>
    </section>
  );
}
