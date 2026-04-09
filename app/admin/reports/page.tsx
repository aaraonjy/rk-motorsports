import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminReportsPage() {
  const user = await getSessionUser();

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Reports</h1>
        <p className="mt-4 text-white/70">
          Choose a report type to filter, preview on screen, and export as CSV.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/reports/sales"
            className="card-rk block rounded-3xl border border-white/10 p-6 transition hover:border-white/20 hover:bg-white/[0.03]"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              Available
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Sales Report</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Review all order records with filters for status, date range, order type, tuning type,
              customer keyword, and vehicle number.
            </p>
            <div className="mt-6 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
              View Report
            </div>
          </Link>

          <Link
            href="/admin/reports/customers"
            className="card-rk block rounded-3xl border border-white/10 p-6 transition hover:border-white/20 hover:bg-white/[0.03]"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              Available
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Customer Report</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Review customer records with filters, preview key customer metrics, and export as CSV.
            </p>
            <div className="mt-6 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
              View Report
            </div>
          </Link>

          <Link
            href="/admin/reports/order-status"
            className="card-rk block rounded-3xl border border-white/10 p-6 transition hover:border-white/20 hover:bg-white/[0.03]"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              Available
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Order Status Report</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Review order status records with filters, preview current status distribution, and export as CSV.
            </p>
            <div className="mt-6 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
              View Report
            </div>
          </Link>

          <div className="card-rk rounded-3xl border border-white/10 p-6 opacity-60">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              Next Phase
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Revenue Summary</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Reserved for future revenue summary reporting.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
