import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { type OrderWithRelations } from "@/components/order-table";

type RevenueSummaryPageProps = {
  searchParams?: Promise<{
    status?: string;
    orderType?: string;
    viewBy?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

type RevenueRow = {
  periodKey: string;
  periodLabel: string;
  totalOrders: number;
  totalRevenue: number;
  completedRevenue: number;
  pendingRevenue: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getOrderAmount(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customGrandTotal ?? order.totalAmount ?? 0;
  }

  return order.totalAmount ?? 0;
}

function getDisplayStatus(order: OrderWithRelations) {
  const isAdminCreatedOrder = !!order.createdByAdminId;

  if (
    isAdminCreatedOrder &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED"
  ) {
    return "FILE_RECEIVED";
  }

  return order.status;
}

function buildPeriod(dateValue: Date, viewBy: string) {
  const year = dateValue.getFullYear();
  const month = dateValue.getMonth();
  const day = dateValue.getDate();

  if (viewBy === "YEARLY") {
    return {
      key: `${year}`,
      label: `${year}`,
    };
  }

  if (viewBy === "DAILY") {
    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-MY", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dateValue),
    };
  }

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("en-MY", {
      year: "numeric",
      month: "long",
    }).format(dateValue),
  };
}

function buildRevenueRows(orders: OrderWithRelations[], viewBy: string) {
  const map = new Map<string, RevenueRow>();

  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const period = buildPeriod(createdAt, viewBy);
    const amount = getOrderAmount(order);
    const displayStatus = getDisplayStatus(order);

    if (!map.has(period.key)) {
      map.set(period.key, {
        periodKey: period.key,
        periodLabel: period.label,
        totalOrders: 0,
        totalRevenue: 0,
        completedRevenue: 0,
        pendingRevenue: 0,
      });
    }

    const row = map.get(period.key)!;
    row.totalOrders += 1;
    row.totalRevenue += amount;

    if (displayStatus === "COMPLETED" || displayStatus === "READY_FOR_DOWNLOAD") {
      row.completedRevenue += amount;
    } else if (displayStatus !== "CANCELLED") {
      row.pendingRevenue += amount;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
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

export default async function RevenueSummaryPage({
  searchParams,
}: RevenueSummaryPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const status = params.status || "ALL";
  const orderType = params.orderType || "ALL";
  const viewBy = params.viewBy === "YEARLY" || params.viewBy === "DAILY" ? params.viewBy : "MONTHLY";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const result = (await getAllOrders({
    status,
    orderType,
    dateFrom,
    dateTo,
    page: 1,
    pageSize: 10000,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const rows = buildRevenueRows(result.orders, viewBy);

  const totalRevenue = result.orders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const completedRevenue = result.orders.reduce((sum, order) => {
    const displayStatus = getDisplayStatus(order);
    return displayStatus === "COMPLETED" || displayStatus === "READY_FOR_DOWNLOAD"
      ? sum + getOrderAmount(order)
      : sum;
  }, 0);
  const pendingRevenue = result.orders.reduce((sum, order) => {
    const displayStatus = getDisplayStatus(order);
    return displayStatus !== "CANCELLED" &&
      displayStatus !== "COMPLETED" &&
      displayStatus !== "READY_FOR_DOWNLOAD"
      ? sum + getOrderAmount(order)
      : sum;
  }, 0);

  const exportQuery = buildQueryString({
    status,
    orderType,
    viewBy,
    dateFrom,
    dateTo,
  });

  return (
    <section className="section-pad">
      <div className="container-rk">
        <Link
          href="/admin/reports"
          className="text-sm text-white/50 transition hover:text-white/80"
        >
          ← Back to Reports
        </Link>

        <h1 className="mt-3 text-4xl font-bold">Revenue Summary</h1>
        <p className="mt-4 text-white/70">
          Review revenue totals with filters, switch between yearly, monthly, or daily grouping, and export as CSV.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Use the filters below to summarize revenue by yearly, monthly, or daily view. Monthly is the default view for easier management reporting.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Status
              </label>
              <div className="relative">
                <select
                  name="status"
                  defaultValue={status}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="FILE_RECEIVED">File Received</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="AWAITING_PAYMENT">Awaiting Payment</option>
                  <option value="PAID">Paid</option>
                  <option value="READY_FOR_DOWNLOAD">Ready for Download</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Order Type
              </label>
              <div className="relative">
                <select
                  name="orderType"
                  defaultValue={orderType}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Order Types</option>
                  <option value="STANDARD_TUNING">Standard Tuning</option>
                  <option value="CUSTOM_ORDER">Custom Order</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                View By
              </label>
              <div className="relative">
                <select
                  name="viewBy"
                  defaultValue={viewBy}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="DAILY">Daily</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <div />

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Date From
              </label>
              <input
                type="date"
                name="dateFrom"
                defaultValue={dateFrom}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Date To
              </label>
              <input
                type="date"
                name="dateTo"
                defaultValue={dateTo}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3 xl:col-span-4">
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 hover:bg-white/10"
              >
                Apply
              </button>
              <Link
                href="/admin/reports/revenue-summary"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </Link>
              <a
                href={exportQuery ? `/api/reports/revenue-summary?${exportQuery}` : "/api/reports/revenue-summary"}
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/85 hover:bg-white/10"
              >
                Export CSV
              </a>
            </div>
          </form>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="card-rk p-6">
              <p className="text-sm text-white/45">Total Revenue</p>
              <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="card-rk p-6">
              <p className="text-sm text-white/45">Completed Revenue</p>
              <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(completedRevenue)}</p>
            </div>
            <div className="card-rk p-6">
              <p className="text-sm text-white/45">Pending Revenue</p>
              <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(pendingRevenue)}</p>
            </div>
            <div className="card-rk p-6">
              <p className="text-sm text-white/45">Total Orders</p>
              <p className="mt-3 text-3xl font-bold text-white">{result.orders.length}</p>
            </div>
          </div>

          <div className="card-rk overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Revenue Preview</h2>
                <p className="mt-2 text-sm text-white/60">
                  Showing {rows.length} grouped record{rows.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center text-white/55">
                No revenue data found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-white/80">
                  <thead className="bg-black/30 text-white/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">
                        {viewBy === "YEARLY" ? "Year" : viewBy === "DAILY" ? "Date" : "Month"}
                      </th>
                      <th className="px-6 py-4 font-medium text-right">Orders</th>
                      <th className="px-6 py-4 font-medium text-right">Revenue</th>
                      <th className="px-6 py-4 font-medium text-right">Completed Revenue</th>
                      <th className="px-6 py-4 font-medium text-right">Pending Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.periodKey} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 font-medium text-white">
                          {row.periodLabel}
                        </td>
                        <td className="px-6 py-5 text-right text-white/90">
                          {row.totalOrders}
                        </td>
                        <td className="px-6 py-5 text-right font-medium text-white">
                          {formatCurrency(row.totalRevenue)}
                        </td>
                        <td className="px-6 py-5 text-right text-emerald-300">
                          {formatCurrency(row.completedRevenue)}
                        </td>
                        <td className="px-6 py-5 text-right text-amber-300">
                          {formatCurrency(row.pendingRevenue)}
                        </td>
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
