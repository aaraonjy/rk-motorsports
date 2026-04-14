import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

function ReportCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="card-rk flex h-full flex-col rounded-3xl border border-white/10 p-6 transition hover:border-white/20 hover:bg-white/[0.03]"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
        Available
      </div>
      <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-white/60">{description}</p>
      <div className="mt-auto pt-6">
        <div className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
          View Report
        </div>
      </div>
    </Link>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </div>
  );
}

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

        <div className="mt-8 space-y-10">
          <ReportSection title="Customer Reports">
            <ReportCard
              href="/admin/reports/customers"
              title="Customer Report"
              description="Review customer records with filters, preview key customer metrics, and export as CSV."
            />

            <ReportCard
              href="/admin/reports/customer-payment-balance"
              title="Customer Payment Balance Report"
              description="Review custom order payment balances with filters for customer, date range, order status, payment status, outstanding records, and export as CSV."
            />
          </ReportSection>

          <ReportSection title="Sales Reports">
            <ReportCard
              href="/admin/reports/sales"
              title="Sales Report"
              description="Review all order records with filters for status, date range, order type, tuning type, customer keyword, and vehicle number."
            />

            <ReportCard
              href="/admin/reports/order-status"
              title="Order Status Report"
              description="Review order status records with filters, preview current status distribution, and export as CSV."
            />

            <ReportCard
              href="/admin/reports/revenue-summary"
              title="Revenue Summary"
              description="Review revenue totals with filters, switch between yearly, monthly, or daily grouping, and export as CSV."
            />
          </ReportSection>

          <ReportSection title="Tax Reports">
            <ReportCard
              href="/admin/reports/tax"
              title="Tax Report"
              description="Review invoice and credit note tax rows, filter by tax code, preview net tax with CN shown as negative rows, and export as CSV."
            />
          </ReportSection>
        </div>
      </div>
    </section>
  );
}
