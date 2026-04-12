import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { type OrderWithRelations } from "@/components/order-table";

type OrderStatusReportPageProps = {
  searchParams?: Promise<{
    status?: string;
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

function formatDate(value: Date | null) {
  if (!value) return "-";
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
    return Number(order.customGrandTotal ?? order.totalAmount ?? 0);
  }

  return Number(order.totalAmount ?? 0);
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
  switch (getReportDisplayStatus(order)) {
    case "FILE_RECEIVED":
    case "RECEIVED":
      return "Received";
    case "IN_PROGRESS":
      return "In Progress";
    case "AWAITING_PAYMENT":
      return "Pending Payment";
    case "READY_FOR_DOWNLOAD":
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PAID":
      return "Paid";
    default:
      return getReportDisplayStatus(order).replaceAll("_", " ");
  }
}

function getReportStatusBadgeClass(order: OrderWithRelations) {
  switch (getReportDisplayStatus(order)) {
    case "RECEIVED":
    case "FILE_RECEIVED":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-center text-xs font-semibold text-sky-300";
    case "COMPLETED":
    case "READY_FOR_DOWNLOAD":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300";
    case "CANCELLED":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
    case "IN_PROGRESS":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-center text-xs font-semibold text-violet-300";
    case "AWAITING_PAYMENT":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-300";
    case "PAID":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-center text-xs font-semibold text-cyan-300";
    default:
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/80";
  }
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

export default async function OrderStatusReportPage({
  searchParams,
}: OrderStatusReportPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const status = params.status || "ALL";
  const customerKeyword = params.customerKeyword || "";
  const tuningType = params.tuningType || "ALL";
  const orderType = params.orderType || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const result = (await getAllOrders({
    status,
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

        <h1 className="mt-3 text-4xl font-bold">Order Status Report</h1>
        <p className="mt-4 text-white/70">
          Filter order records by status, preview the results on screen, and export the report as CSV.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Use the filters below to review order status records by customer, vehicle number, status,
              tuning type, order type, or date range. If an order has a Credit Note, the report will
              show the CN reference separately.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
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
                href="/admin/reports/order-status"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </Link>
              <a
                href={exportQuery ? `/api/reports/order-status?${exportQuery}` : "/api/reports/order-status"}
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
                      <th className="px-6 py-4 font-medium">Credit Note Ref</th>
                      <th className="px-6 py-4 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.orders.map((order) => (
                      <tr key={order.id} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 text-white/90">{formatDate(new Date(order.createdAt))}</td>
                        <td className="px-6 py-5 font-medium text-white">{order.orderNumber}</td>
                        <td className="px-6 py-5 text-white/90">
                          <div>{order.user?.name || "-"}</div>
                          <div className="mt-1 text-xs text-white/45">{order.user?.phone || "-"}</div>
                          <div className="text-xs text-white/45">{order.user?.email || "-"}</div>
                        </td>
                        <td className="px-6 py-5 text-white/90">{getOrderTypeLabel(order.orderType)}</td>
                        <td className="px-6 py-5 text-white/90">{getOrderTitle(order)}</td>
                        <td className="px-6 py-5 text-white/90">
                          {order.orderType === "CUSTOM_ORDER" ? "-" : getTuningTypeLabel(order.tuningType)}
                        </td>
                        <td className="px-6 py-5 text-white/90">{order.vehicleNo || "-"}</td>
                        <td className="px-6 py-5">
                          <span className={getReportStatusBadgeClass(order)}>
                            {getReportDisplayStatusLabel(order)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {order.creditNote ? (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                              <div className="font-semibold">{order.creditNote.cnNo}</div>
                              <div className="mt-1 text-red-200/80">{formatDate(new Date(order.creditNote.cnDate))}</div>
                            </div>
                          ) : (
                            <span className="text-white/45">-</span>
                          )}
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
