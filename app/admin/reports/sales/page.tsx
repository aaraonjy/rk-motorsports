import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { type OrderWithRelations } from "@/components/order-table";

type SalesReportPageProps = {
  searchParams?: Promise<{
    status?: string;
    search?: string;
    customerKeyword?: string;
    tuningType?: string;
    orderType?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function getOrderTypeLabel(value?: string | null) {
  return value === "CUSTOM_ORDER" ? "Custom Order" : "Standard Tuning";
}

function getTuningTypeLabel(value?: string | null) {
  if (value === "ECU_TCU") return "ECU + TCU";
  if (value === "TCU") return "TCU";
  return "ECU";
}

function getOrderTitle(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customTitle || "Custom Order";
  }

  return order.selectedTuneLabel || `${getTuningTypeLabel(order.tuningType)} Tune`;
}

function getOrderAmount(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customGrandTotal ?? order.totalAmount ?? 0;
  }

  return order.totalAmount ?? 0;
}


function getReportDisplayStatus(order: OrderWithRelations) {
  const isAdminCreatedOrder = !!order.createdByAdminId;

  if (
    isAdminCreatedOrder &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED"
  ) {
    return "RECEIVED";
  }

  return order.status;
}

function getReportDisplayStatusLabel(order: OrderWithRelations) {
  return getReportDisplayStatus(order).replaceAll("_", " ");
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

export default async function SalesReportPage({
  searchParams,
}: SalesReportPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const status = params.status || "ALL";
  const search = params.search || "";
  const customerKeyword = params.customerKeyword || "";
  const tuningType = params.tuningType || "ALL";
  const orderType = params.orderType || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const result = (await getAllOrders({
    status,
    search,
    customerKeyword,
    tuningType,
    orderType,
    dateFrom,
    dateTo,
    page: 1,
    pageSize: 1000,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const exportQuery = buildQueryString({
    status,
    search,
    customerKeyword,
    tuningType,
    orderType,
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

        <h1 className="mt-3 text-4xl font-bold">Sales Report</h1>
        <p className="mt-4 text-white/70">
          Filter order data, preview the results on screen, and export the report as CSV.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Use the filters below to narrow down the sales report by order number, customer,
              vehicle number, status, tuning type, order type, or date range.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Search Order Number
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search order number"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Customer / Phone / Email / Vehicle No.
              </label>
              <input
                type="text"
                name="customerKeyword"
                defaultValue={customerKeyword}
                placeholder="Search name, phone, email, or vehicle no"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Filter Status
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Tuning Type
              </label>
              <div className="relative">
                <select
                  name="tuningType"
                  defaultValue={tuningType}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Tuning Types</option>
                  <option value="ECU">ECU</option>
                  <option value="TCU">TCU</option>
                  <option value="ECU_TCU">ECU + TCU</option>
                </select>

                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>

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
                href="/admin/reports/sales"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </Link>
              <a
                href={exportQuery ? `/api/reports/sales?${exportQuery}` : "/api/reports/sales"}
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
                  Showing {result.orders.length} record{result.orders.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            {result.orders.length === 0 ? (
              <div className="px-6 py-12 text-center text-white/55">
                No report data found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-white/80">
                  <thead className="bg-black/30 text-white/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Order No.</th>
                      <th className="px-6 py-4 font-medium">Customer</th>
                      <th className="px-6 py-4 font-medium">Order Type</th>
                      <th className="px-6 py-4 font-medium">Title / Summary</th>
                      <th className="px-6 py-4 font-medium">Tuning Type</th>
                      <th className="px-6 py-4 font-medium">Vehicle No.</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.orders.map((order) => (
                      <tr key={order.id} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 text-white/65">
                          {formatDate(new Date(order.createdAt))}
                        </td>
                        <td className="px-6 py-5 font-medium text-white">
                          {order.orderNumber}
                        </td>
                        <td className="px-6 py-5 text-white/90">
                          {order.user?.name || "-"}
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {getOrderTypeLabel(order.orderType)}
                        </td>
                        <td className="px-6 py-5 text-white/90">
                          {getOrderTitle(order)}
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {getTuningTypeLabel(order.tuningType)}
                        </td>
                        <td className="px-6 py-5 text-white/90">
                          {order.vehicleNo || "-"}
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {getReportDisplayStatusLabel(order)}
                        </td>
                        <td className="px-6 py-5 text-right font-medium text-white">
                          {formatCurrency(getOrderAmount(order))}
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
