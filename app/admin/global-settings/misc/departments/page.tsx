import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/shared/admin-master-list-client";

const PAGE_SIZE = 10;

export default async function AdminDepartmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [items, projects] = await Promise.all([
    db.department.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      include: { project: { select: { id: true, code: true, name: true } } },
    }),
    db.project.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <h1 className="text-4xl font-bold">Department Maintenance</h1>
        <p className="mt-4 max-w-3xl text-white/70">Manage department master data and map each department under a project.</p>
        <div className="mt-10">
          <AdminMasterListClient
            title="Department"
            subtitle="Misc"
            apiBase="/api/admin/global-settings/misc-departments"
            requireGroup={true}
            groupLabelTitle="Project"
            groupPlaceholder="Select project"
            groups={projects}
            initialItems={items.map((item) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              isActive: item.isActive,
              groupId: item.projectId,
              groupLabel: `${item.project.code} — ${item.project.name}`,
            }))}
            initialPagination={{
              page: 1,
              pageSize: PAGE_SIZE,
              total: items.length,
              totalPages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
            }}
          />
        </div>
      </div>
    </section>
  );
}
