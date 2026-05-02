import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMasterListClient } from "@/components/shared/admin-master-list-client";

export default async function AdminCountryMaintenancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [items, total] = await Promise.all([
    db.country.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      take: 10,
      select: { id: true, code: true, name: true, isActive: true },
    }),
    db.country.count(),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Misc</p>
            <h1 className="mt-3 text-4xl font-bold">Country Maintenance</h1>
            <p className="mt-4 max-w-3xl text-white/70">Create and manage country codes used by customer billing and delivery addresses.</p>
          </div>
          <Link href="/admin/global-settings/misc" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10">
            Back to Misc
          </Link>
        </div>

        <AdminMasterListClient
          title="Country List"
          subtitle="Country Master"
          apiBase="/api/admin/global-settings/misc-countries"
          initialItems={items}
          initialPagination={{ page: 1, pageSize: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) }}
        />
      </div>
    </section>
  );
}
