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
    documentType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
  }>;
};

type SalesTransactionRow = {
  id: string;
  date: Date;
  docNo: string;
  documentType: "CS" | "INV" | "CN";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderTypeLabel: string;
  titleSummary: string;
  tuningTypeLabel: string;
  vehicleNo: string;
  statusLabel: string;
  referenceInvoiceNo: string;
  subtotal: number;
  discount: number;
  taxCode: string;
  taxAmount: number;
  grandTotal: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function getTuningTypeLabel(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") return "-";
  if (order.tuningType === "ECU_TCU") return "ECU + TCU";
  if (order.tuningType === "TCU") return "TCU";
  return "ECU";
}

function getOrderTitle(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customTitle || "Custom Order";
  }

  return order.selectedTuneLabel || `${getTuningTypeLabel(order)} Tune`;
}

function getOrderSubtotal(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return Number(order.customSubtotal ?? order.taxableSubtotal ?? order.totalAmount ?? 0);
  }

  return Number(order.taxableSubtotal ?? order.totalAmount ?? 0);
}

function getOrderDiscount(order: OrderWithRelations) {
  return Number(order.customDiscount ?? 0);
}

function getOrderTaxCode(order: OrderWithRelations) {
  return String(order.taxCode ?? order.taxDisplayLabel ?? "-");
}

function getOrderTaxAmount(order: OrderWithRelations) {
  return Number(order.taxAmount ?? 0);
}

function getOrderAmount(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return Number(order.grandTotalAfterTax ?? order.customGrandTotal ?? order.totalAmount ?? 0);
  }

  return Number(order.grandTotalAfterTax ?? order.totalAmount ?? 0);
}

function getOrderDocumentType(order: OrderWithRelations): "CS" | "INV" {
  return order.docType === "CS" ? "CS" : "INV";
}

function getDocumentTypeLabel(value: "CS" | "INV" | "CN") {
  switch (value) {
    case "CS":
      return "Cash Sale";
    case "INV":
      return "Invoice";
    case "CN":
      return "Credit Note";
    default:
      return value;
  }
}

function getDocumentTypeBadgeClass(value: "CS" | "INV" | "CN") {
  switch (value) {
    case "CS":
      return "inline-flex min-w-[96px] items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-center text-xs font-semibold text-cyan-300";
    case "INV":
      return "inline-flex min-w-[96px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/80";
    case "CN":
      return "inline-flex min-w-[96px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
    default:
      return "inline-flex min-w-[96px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/80";
  }
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
      return String(getReportDisplayStatus(order) || "").replace(/_/g, " ");
  }
}

function getReportStatusBadgeClass(label: string) {
  switch (label) {
    case "Received":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-center text-xs font-semibold text-sky-300";
    case "Completed":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300";
    case "Cancelled":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
    case "In Progress":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-center text-xs font-semibold text-violet-300";
    case "Pending Payment":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-300";
    case "Paid":
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-center text-xs font-semibold text-cyan-300";
    default:
      if (label.startsWith("Credit Note")) {
        return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
      }
      return "inline-flex min-w-[112px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/80";
  }
}

function getCreditNoteReasonLabel(value?: string | null) {
  switch (value) {
    case "CUSTOMER_CANCEL_ORDER":
      return "Customer Cancel Order";
    case "PRICING_CORRECTION":
      return "Pricing Correction";
    case "OVERCHARGE_ADJUSTMENT":
      return "Overcharge Adjustment";
    case "DUPLICATE_INVOICE":
      return "Duplicate Invoice";
    case "SERVICE_NOT_PROCEEDED":
      return "Service Not Proceeded";
    case "OTHER":
      return "Other";
    default:
      return value || "-";
  }
}

function isWithinDateRange(value: Date, dateFrom?: string, dateTo?: string) {
  const time = value.getTime();
  if (dateFrom) {
    const start = new Date(dateFrom);
    if (!Number.isNaN(start.getTime()) && time < start.getTime()) return false;
  }

  if (dateTo) {
    const end = new Date(dateTo);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (time > end.getTime()) return false;
    }
  }

  return true;
}

function buildSalesTransactionRows(
  orders: OrderWithRelations[],
  documentType: string,
  dateFrom?: string,
  dateTo?: string
): SalesTransactionRow[] {
  const rows: SalesTransactionRow[] = [];

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const orderDocumentType = getOrderDocumentType(order);

    if (
      (documentType === "ALL" || documentType === orderDocumentType) &&
      isWithinDateRange(orderDate, dateFrom, dateTo)
    ) {
      rows.push({
        id: `order-${order.id}`,
        date: orderDate,
        docNo: order.orderNumber,
        documentType: orderDocumentType,
        customerName: order.user?.name || "-",
        customerEmail: order.user?.email || "-",
        customerPhone: order.user?.phone || "-",
        orderTypeLabel: getOrderTypeLabel(order.orderType),
        titleSummary: getOrderTitle(order),
        tuningTypeLabel: getTuningTypeLabel(order),
        vehicleNo: order.vehicleNo || "-",
        statusLabel: getReportDisplayStatusLabel(order),
        referenceInvoiceNo: "-",
        subtotal: getOrderSubtotal(order),
        discount: getOrderDiscount(order),
        taxCode: getOrderTaxCode(order),
        taxAmount: getOrderTaxAmount(order),
        grandTotal: getOrderAmount(order),
      });
    }

    if (order.creditNote) {
      const cnDate = new Date(order.creditNote.cnDate);
      if (
        (documentType === "ALL" || documentType === "CN") &&
        isWithinDateRange(cnDate, dateFrom, dateTo)
      ) {
        rows.push({
          id: `cn-${order.creditNote.id}`,
          date: cnDate,
          docNo: order.creditNote.cnNo,
          documentType: "CN",
          customerName: order.user?.name || "-",
          customerEmail: order.user?.email || "-",
          customerPhone: order.user?.phone || "-",
          orderTypeLabel: getOrderTypeLabel(order.orderType),
          titleSummary: getCreditNoteReasonLabel(order.creditNote.reasonType),
          tuningTypeLabel: getTuningTypeLabel(order),
          vehicleNo: order.vehicleNo || "-",
          statusLabel: `Credit Note`,
          referenceInvoiceNo: order.orderNumber,
          subtotal: -Math.abs(getOrderSubtotal(order)),
          discount: -Math.abs(getOrderDiscount(order)),
          taxCode: getOrderTaxCode(order),
          taxAmount: -Math.abs(getOrderTaxAmount(order)),
          grandTotal: -Math.abs(Number(order.creditNote.amount || getOrderAmount(order))),
        });
      }
    }
  }

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
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


const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizePageSize(value: string | undefined) {
  const parsed = parsePositiveInt(value, 20);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : 20;
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  return {
    items: items.slice(startIndex, endIndex),
    totalCount,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
  };
}

function PaginationControls({
  basePath,
  baseParams,
  currentPage,
  pageSize,
  totalCount,
  totalPages,
  startIndex,
  endIndex,
  itemLabel,
}: {
  basePath: string;
  baseParams: Record<string, string | undefined>;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  itemLabel: string;
}) {
  if (totalCount === 0) return null;

  const buildHref = (nextPage: number, nextPageSize: number = pageSize) => {
    const query = buildQueryString({
      ...baseParams,
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    return query ? `${basePath}?${query}` : basePath;
  };

  const pageButtons: number[] = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  for (let page = startPage; page <= endPage; page += 1) {
    pageButtons.push(page);
  }

  return (
    <div className="flex flex-col gap-4 border-t border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-white/60">
        Showing {startIndex + 1}-{endIndex} of {totalCount} {itemLabel}
        {totalCount === 1 ? "" : "s"}.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-white/50">Rows per page</span>
        {PAGE_SIZE_OPTIONS.map((option) => (
          <Link
            key={option}
            href={buildHref(1, option)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              option === pageSize
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/15 bg-black/30 text-white/70 hover:bg-white/10"
            }`}
          >
            {option}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildHref(Math.max(1, currentPage - 1))}
          className={`rounded-xl border px-3 py-2 text-sm transition ${
            currentPage === 1
              ? "pointer-events-none border-white/10 bg-black/20 text-white/30"
              : "border-white/15 bg-black/30 text-white/85 hover:bg-white/10"
          }`}
        >
          Previous
        </Link>

        {pageButtons.map((page) => (
          <Link
            key={page}
            href={buildHref(page)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              page === currentPage
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/15 bg-black/30 text-white/70 hover:bg-white/10"
            }`}
          >
            {page}
          </Link>
        ))}

        <Link
          href={buildHref(Math.min(totalPages, currentPage + 1))}
          className={`rounded-xl border px-3 py-2 text-sm transition ${
            currentPage >= totalPages
              ? "pointer-events-none border-white/10 bg-black/20 text-white/30"
              : "border-white/15 bg-black/30 text-white/85 hover:bg-white/10"
          }`}
        >
          Next
        </Link>
      </div>
    </div>
  );
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
  const documentType = params.documentType || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";
  const page = parsePositiveInt(params.page, 1);
  const pageSize = normalizePageSize(params.pageSize);

  const result = (await getAllOrders({
    status,
    search,
    customerKeyword,
    tuningType,
    orderType,
    page: 1,
    pageSize: 10000,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const transactionRows = buildSalesTransactionRows(result.orders, documentType, dateFrom, dateTo);
  const paginatedRows = paginateItems(transactionRows, page, pageSize);

  const exportQuery = buildQueryString({
    status,
    search,
    customerKeyword,
    tuningType,
    orderType,
    documentType,
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
              vehicle number, status, tuning type, order type, document type, or date range.
              Credit Notes are included as separate negative transactions for calculation purposes.
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
                placeholder="Search order number or CN number"
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
                Document Type
              </label>
              <div className="relative">
                <select
                  name="documentType"
                  defaultValue={documentType}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Transactions</option>
                  <option value="CS">Cash Sales</option>
                  <option value="INV">Invoice</option>
                  <option value="CN">Credit Note</option>
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
                  Showing {paginatedRows.totalCount} transaction record{paginatedRows.totalCount === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            {paginatedRows.totalCount === 0 ? (
              <div className="px-6 py-12 text-center text-white/55">
                No report data found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-white/80">
                  <thead className="bg-black/30 text-white/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Doc No.</th>
                      <th className="px-6 py-4 font-medium">Document Type</th>
                      <th className="px-6 py-4 font-medium">Customer</th>
                      <th className="px-6 py-4 font-medium">Order Type</th>
                      <th className="px-6 py-4 font-medium">Title / Summary</th>
                      <th className="px-6 py-4 font-medium">Tuning Type</th>
                      <th className="px-6 py-4 font-medium">Vehicle No.</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Reference Invoice</th>
                      <th className="px-6 py-4 font-medium text-right">Subtotal</th>
                      <th className="px-6 py-4 font-medium text-right">Discount</th>
                      <th className="px-6 py-4 font-medium">Tax Code</th>
                      <th className="px-6 py-4 font-medium text-right">Tax Amount</th>
                      <th className="px-6 py-4 font-medium text-right">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.items.map((row) => (
                      <tr key={row.id} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 text-white/90">{formatDate(row.date)}</td>
                        <td className={`px-6 py-5 font-medium ${row.documentType === "CN" ? "text-red-200" : "text-white"}`}>
                          {row.docNo}
                        </td>
                        <td className="px-6 py-5">
                          <span className={getDocumentTypeBadgeClass(row.documentType)}>
                            {getDocumentTypeLabel(row.documentType)}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-white/90">
                          <div>{row.customerName}</div>
                          <div className="mt-1 text-xs text-white/45">{row.customerPhone}</div>
                          <div className="text-xs text-white/45">{row.customerEmail}</div>
                        </td>
                        <td className="px-6 py-5 text-white/90">{row.orderTypeLabel}</td>
                        <td className="px-6 py-5 text-white/90">{row.titleSummary}</td>
                        <td className="px-6 py-5 text-white/90">{row.tuningTypeLabel}</td>
                        <td className="px-6 py-5 text-white/90">{row.vehicleNo}</td>
                        <td className="px-6 py-5">
                          <span className={getReportStatusBadgeClass(row.statusLabel)}>
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-white/90">{row.referenceInvoiceNo}</td>
                        <td className={`whitespace-nowrap px-6 py-5 text-right font-medium ${row.documentType === "CN" ? "text-red-200" : "text-white"}`}>
                          {formatCurrency(row.subtotal)}
                        </td>
                        <td className={`whitespace-nowrap px-6 py-5 text-right font-medium ${row.documentType === "CN" ? "text-red-200" : "text-white"}`}>
                          {formatCurrency(row.discount)}
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-white/90">{row.taxCode}</td>
                        <td className={`whitespace-nowrap px-6 py-5 text-right font-medium ${row.documentType === "CN" ? "text-red-200" : "text-white"}`}>
                          {formatCurrency(row.taxAmount)}
                        </td>
                        <td className={`whitespace-nowrap px-6 py-5 text-right font-medium ${row.documentType === "CN" ? "text-red-200" : "text-white"}`}>
                          {formatCurrency(row.grandTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationControls
              basePath="/admin/reports/sales"
              baseParams={{ status, search, customerKeyword, tuningType, orderType, documentType, dateFrom, dateTo }}
              currentPage={paginatedRows.currentPage}
              pageSize={pageSize}
              totalCount={paginatedRows.totalCount}
              totalPages={paginatedRows.totalPages}
              startIndex={paginatedRows.startIndex}
              endIndex={paginatedRows.endIndex}
              itemLabel="transaction record"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
