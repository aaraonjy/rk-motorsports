import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getCustomersReport } from "@/lib/queries";
import { redirect } from "next/navigation";

type CustomerReportPageProps = {
  searchParams?: Promise<{
    search?: string;
    source?: string;
    portalAccess?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

type CustomerReportRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  createdAt: Date;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: Date | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function buildQueryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim().length > 0 && value !== "ALL") {
      searchParams.set(key, value);
    }
  });

  return searchParams.toString();
}

export default async function CustomerReportPage({ searchParams }: CustomerReportPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const search = params.search || "";
  const source = params.source || "ALL";
  const portalAccess = params.portalAccess || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const customers = (await getCustomersReport({
    search,
    source,
    portalAccess,
    dateFrom,
    dateTo,
  })) as CustomerReportRecord[];

  const exportQuery = buildQueryString({
    search,
    source,
    portalAccess,
    dateFrom,
    dateTo,
  });

  return (
    <section className="section-pad">
      <div className="container-rk">
        <Link href="/admin/reports" className="text-sm text-white/50 transition hover:text-white/80">
          ← Back to Reports
        </Link>

        <h1 className="mt-3 text-4xl font-bold">Customer Report</h1>
        <p className="mt-4 text-white/70">
          Filter customer data, preview the results on screen, and export the report as CSV.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Use the filters below to narrow down the customer report by name, phone, email,
              account source, portal access, or order date range.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm text-white/65">Customer Name / Phone / Email</label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search name, phone, or email"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Account Source</label>
              <div className="relative">
                <select
                  name="source"
                  defaultValue={source}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Sources</option>
                  <option value="PORTAL">Self Registered</option>
                  <option value="ADMIN">Admin Created</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Portal Access</label>
              <div className="relative">
                <select
                  name="portalAccess"
                  defaultValue={portalAccess}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Access States</option>
                  <option value="ENABLED">Enabled</option>
                  <option value="DISABLED">Disabled</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Date From</label>
              <input
                type="date"
                name="dateFrom"
                defaultValue={dateFrom}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Date To</label>
              <input
                type="date"
                name="dateTo"
                defaultValue={dateTo}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3 xl:col-span-4">
              <button type="submit" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 hover:bg-white/10">
                Apply
              </button>
              <Link href="/admin/reports/customers" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10">
                Reset
              </Link>
              <a
                href={exportQuery ? `/api/reports/customers?${exportQuery}` : "/api/reports/customers"}
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/85 hover:bg-white/10"
              >
                Export CSV
              </a>
            </div>
          </form>

          <div className="card-rk overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Report Preview</h2>
                <p className="mt-2 text-sm text-white/60">
                  Showing {customers.length} record{customers.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            {customers.length === 0 ? (
              <div className="px-6 py-12 text-center text-white/55">
                No report data found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-white/80">
                  <thead className="bg-black/30 text-white/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Customer Name</th>
                      <th className="px-6 py-4 font-medium">Phone</th>
                      <th className="px-6 py-4 font-medium">Email</th>
                      <th className="px-6 py-4 font-medium">Account Source</th>
                      <th className="px-6 py-4 font-medium">Portal Access</th>
                      <th className="px-6 py-4 font-medium text-right">Total Orders</th>
                      <th className="px-6 py-4 font-medium text-right">Total Spent</th>
                      <th className="px-6 py-4 font-medium">Last Order Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer.id} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 font-medium text-white">{customer.name}</td>
                        <td className="px-6 py-5 text-white/90">{customer.phone || "-"}</td>
                        <td className="px-6 py-5 text-white/90">{customer.email}</td>
                        <td className="px-6 py-5 text-white/65">
                          {customer.accountSource === "ADMIN" ? "Admin Created" : "Self Registered"}
                        </td>
                        <td className="px-6 py-5 text-white/65">{customer.portalAccess ? "Enabled" : "Disabled"}</td>
                        <td className="px-6 py-5 text-right font-medium text-white">{customer.totalOrders}</td>
                        <td className="px-6 py-5 text-right font-medium text-white">{formatCurrency(customer.totalSpent)}</td>
                        <td className="px-6 py-5 text-white/65">{formatDate(customer.lastOrderDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
