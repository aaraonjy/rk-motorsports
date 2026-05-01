import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/shared/admin-master-list-client";

const PAGE_SIZE = 10;

export default async function AdminAgentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const items = await db.agent.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <h1 className="text-4xl font-bold">Agent Maintenance</h1>
        <p className="mt-4 max-w-3xl text-white/70">
          Manage agent master data for customer profile assignment and future reporting.
        </p>
        <div className="mt-10">
          <AdminMasterListClient
            title="Agent"
            subtitle="Misc"
            apiBase="/api/admin/misc-agents"
            initialItems={items.map((item) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              isActive: item.isActive,
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
