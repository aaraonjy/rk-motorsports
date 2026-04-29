import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminCreditNoteClient } from "@/components/admin-credit-note-client";

export default async function AdminCreditNotePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [taxCodes, agents, projects, departments] = await Promise.all([
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
        <AdminCreditNoteClient
          initialTaxCodes={taxCodes.map((taxCode) => ({
            id: taxCode.id,
            code: taxCode.code,
            description: taxCode.description,
            rate: Number(taxCode.rate ?? 0),
            calculationMethod: taxCode.calculationMethod,
          }))}
          initialAgents={agents}
          initialProjects={projects}
          initialDepartments={departments}
        />
      </div>
    </section>
  );
}
