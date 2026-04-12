import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { type OrderWithRelations } from "@/components/order-table";
import { CustomerPaymentBalanceTable } from "@/components/reports/customer-payment-balance-table";

type CustomerPaymentBalanceReportPageProps = {
  searchParams?: Promise<{
    search?: string;
    customerKeyword?: string;
    status?: string;
    paymentStatus?: string;
    balanceType?: string;
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

function getOrderAmount(order: OrderWithRelations) {
  return Number(order.customGrandTotal ?? order.totalAmount ?? 0);
}

function getOrderOutstandingBalance(order: OrderWithRelations) {
  const grandTotal = getOrderAmount(order);
  const outstanding = Number(order.outstandingBalance ?? Math.max(grandTotal - Number(order.totalPaid ?? 0), 0));
  return Math.max(Number(outstanding), 0);
}

function getPaymentStatusLabel(order: OrderWithRelations) {
  const totalPaid = Number(order.totalPaid ?? 0);
  const outstandingBalance = getOrderOutstandingBalance(order);

  if (order.status === "COMPLETED") return "Completed";
  if (order.status === "CANCELLED") return "Cancelled";
  if (outstandingBalance === 0) return "Paid";
  if (totalPaid > 0) return "Partially Paid";
  return "Unpaid";
}

function getPaymentStatusBadgeClass(order: OrderWithRelations) {
  const totalPaid = Number(order.totalPaid ?? 0);
  const outstandingBalance = getOrderOutstandingBalance(order);

  if (order.status === "COMPLETED") {
    return "inline-flex min-w-[132px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300";
  }

  if (order.status === "CANCELLED") {
    return "inline-flex min-w-[132px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
  }

  if (outstandingBalance === 0) {
    return "inline-flex min-w-[132px] items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-center text-xs font-semibold text-cyan-300";
  }

  if (totalPaid > 0) {
    return "inline-flex min-w-[132px] items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-center text-xs font-semibold text-violet-300";
  }

  return "inline-flex min-w-[132px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-300";
}

function getReportDisplayStatusLabel(order: OrderWithRelations) {
  switch (order.status) {
    case "FILE_RECEIVED":
      return "Received";
    case "IN_PROGRESS":
      return "In Progress";
    case "AWAITING_PAYMENT":
      return "Pending Payment";
    case "READY_FOR_DOWNLOAD":
      return "Ready for Download";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PAID":
      return "Paid";
    default:
      return String(order.status || "").replace(/_/g, " ");
  }
}

function getReportStatusBadgeClass(order: OrderWithRelations) {
  switch (order.status) {
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

function getPaymentModeLabel(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();

  switch (normalized) {
    case "CASH":
      return "Cash";
    case "BANK_TRANSFER":
      return "Bank Transfer";
    case "CARD":
    case "CARD_PAYMENT":
      return "Card Payment";
    case "QR":
    case "QR_PAYMENT":
      return "QR Payment";
    default:
      return String(value || "").trim() || "Other";
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

export default async function CustomerPaymentBalanceReportPage({
  searchParams,
}: CustomerPaymentBalanceReportPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const search = params.search || "";
  const customerKeyword = params.customerKeyword || "";
  const status = params.status || "ALL";
  const paymentStatus = params.paymentStatus || "ALL";
  const balanceType = params.balanceType || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const outstandingOnly = balanceType === "OUTSTANDING";

  const result = (await getAllOrders({
    search,
    customerKeyword,
    status,
    paymentStatus,
    outstandingOnly,
    orderType: "CUSTOM_ORDER",
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

  const filteredOrders =
    balanceType === "PAID"
      ? result.orders.filter((order) => getOrderOutstandingBalance(order) === 0)
      : result.orders;

  const exportQuery = buildQueryString({
    search,
    customerKeyword,
    status,
    paymentStatus,
    balanceType,
    dateFrom,
    dateTo,
  });

  const tableRows = filteredOrders.map((order) => ({
    id: order.id,
    date: formatDate(new Date(order.createdAt)),
    orderNumber: order.orderNumber,
    customerName: order.user?.name || "-",
    vehicleNo: order.vehicleNo || "-",
    orderStatusLabel: getReportDisplayStatusLabel(order),
    orderStatusBadgeClass: getReportStatusBadgeClass(order),
    grandTotal: formatCurrency(getOrderAmount(order)),
    totalPaid: formatCurrency(order.totalPaid ?? 0),
    outstandingBalance: formatCurrency(getOrderOutstandingBalance(order)),
    paymentStatusLabel: getPaymentStatusLabel(order),
    paymentStatusBadgeClass: getPaymentStatusBadgeClass(order),
    paymentRecords: (order.payments || []).map((payment) => ({
      id: payment.id,
      paymentDate: formatDate(new Date(payment.paymentDate)),
      paymentMode: getPaymentModeLabel(payment.paymentMode),
      amount: formatCurrency(Number(payment.amount || 0)),
    })),
  }));

  return (
    <section className="section-pad">
      <div className="container-rk">
        <Link
          href="/admin/reports"
          className="text-sm text-white/50 transition hover:text-white/80"
        >
          ← Back to Reports
        </Link>

        <h1 className="mt-3 text-4xl font-bold">Customer Payment Balance Report</h1>
        <p className="mt-4 text-white/70">
          Filter custom order payment balances, preview the results on screen, and export the report as CSV.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Use the filters below to narrow down the payment balance report by order number,
              customer, vehicle number, order status, payment status, balance type, or date range.
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
                Order Status
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
                Payment Status
              </label>
              <div className="relative">
                <select
                  name="paymentStatus"
                  defaultValue={paymentStatus}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Payment Statuses</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="PAID">Paid</option>
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
                Balance Type
              </label>
              <div className="relative">
                <select
                  name="balanceType"
                  defaultValue={balanceType}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Balances</option>
                  <option value="PAID">Paid Only</option>
                  <option value="OUTSTANDING">Outstanding Only</option>
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
                href="/admin/reports/customer-payment-balance"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </Link>
              <a
                href={
                  exportQuery
                    ? `/api/reports/customer-payment-balance?${exportQuery}`
                    : "/api/reports/customer-payment-balance"
                }
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
                  Showing {tableRows.length} record{tableRows.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            <CustomerPaymentBalanceTable rows={tableRows} />
          </div>
        </div>
      </div>
    </section>
  );
}
