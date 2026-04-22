import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/admin-master-list-client";

export default async function AdminProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const items = await db.project.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }] });

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <h1 className="text-4xl font-bold">Project Maintenance</h1>
        <p className="mt-4 max-w-3xl text-white/70">Manage project master data for stock transaction document tagging.</p>
        <div className="mt-10">
          <AdminMasterListClient
            title="Project"
            subtitle="Misc"
            apiBase="/api/admin/misc-projects"
            initialItems={items.map((item) => ({ id: item.id, code: item.code, name: item.name, isActive: item.isActive }))}
          />
        </div>
      </div>
    </section>
  );
}
