import { getSessionUser } from "@/lib/auth";
import { getAllOrders, getAdminOrderSummaryCounts, type AdminOrderSummaryCounts } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable, type OrderWithRelations } from "@/components/order-table";
import { ClearSuccessParam } from "@/components/clear-success-param";
import { PaginationControls } from "@/components/pagination-controls";

type AdminSearchParams = {
  status?: string;
  search?: string;
  customerKeyword?: string;
  tuningType?: string;
  orderType?: string;
  source?: string;
  paymentStatus?: string;
  outstandingOnly?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  success?: string;
  documentType?: string;
  summary?: string;
};

type AdminPageProps = {
  searchParams?: Promise<AdminSearchParams>;
};

type AdminSummaryKey =
  | "pending_completion"
  | "awaiting_payment"
  | "new_orders"
  | "partially_paid";

type BannerState =
  | {
      tone: "success" | "cancelled";
      title: string;
      message: string;
    }
  | null;

function getAdminBanner(success?: string): BannerState {
  switch (success) {
    case "tuned_ecu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "Tuned ECU file uploaded successfully.",
      };
    case "tuned_tcu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "Tuned TCU file uploaded successfully.",
      };
    case "tuned_files_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "Tuned ECU and TCU files uploaded successfully.",
      };
    case "revision_ecu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "ECU revision file uploaded successfully.",
      };
    case "revision_tcu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "TCU revision file uploaded successfully.",
      };
    case "revision_files_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "ECU and TCU revision files uploaded successfully.",
      };
    case "order_released":
      return {
        tone: "success",
        title: "Success",
        message: "Download released successfully.",
      };
    case "order_completed":
      return {
        tone: "success",
        title: "Success",
        message: "Order completed successfully.",
      };
    case "admin_order_cancelled":
      return {
        tone: "cancelled",
        title: "Cancelled",
        message: "Order cancelled successfully.",
      };
    case "custom_order_payment_outstanding":
      return {
        tone: "cancelled",
        title: "Payment Outstanding",
        message: "Custom order cannot be completed until full payment is received.",
      };
    case "custom_order_created":
      return {
        tone: "success",
        title: "Success",
        message: "Custom order created successfully.",
      };
    case "custom_order_updated":
      return {
        tone: "success",
        title: "Success",
        message: "Custom order updated successfully.",
      };
    case "credit_note_created":
      return {
        tone: "success",
        title: "Success",
        message: "Credit Note created successfully.",
      };
    default:
      return null;
  }
}

function Banner({ data }: { data: NonNullable<BannerState> }) {
  const toneClass =
    data.tone === "cancelled"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

  const eyebrowClass =
    data.tone === "cancelled"
      ? "text-red-300/80"
      : "text-emerald-300/80";

  return (
    <div className={`mt-6 rounded-2xl border p-4 ${toneClass}`}>
      <div
        className={`text-sm font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}
      >
        {data.title}
      </div>
      <p className="mt-2 text-sm leading-6">{data.message}</p>
    </div>
  );
}


const SUMMARY_CARDS: Array<{
  key: AdminSummaryKey;
  label: string;
  toneClass: string;
  countClass: string;
  accentClass: string;
  glowClass: string;
}> = [
  {
    key: "pending_completion",
    label: "Pending Completion",
    toneClass:
      "border-amber-500/30 bg-black/60 text-white shadow-lg shadow-black/30 hover:border-amber-400/50 hover:bg-black/70",
    countClass: "text-amber-300",
    accentClass: "bg-amber-400/80",
    glowClass: "bg-amber-400/10",
  },
  {
    key: "awaiting_payment",
    label: "Awaiting Payment",
    toneClass:
      "border-orange-500/30 bg-black/60 text-white shadow-lg shadow-black/30 hover:border-orange-400/50 hover:bg-black/70",
    countClass: "text-orange-300",
    accentClass: "bg-orange-400/80",
    glowClass: "bg-orange-400/10",
  },
  {
    key: "new_orders",
    label: "New Orders",
    toneClass:
      "border-sky-500/30 bg-black/60 text-white shadow-lg shadow-black/30 hover:border-sky-400/50 hover:bg-black/70",
    countClass: "text-sky-300",
    accentClass: "bg-sky-400/80",
    glowClass: "bg-sky-400/10",
  },
  {
    key: "partially_paid",
    label: "Partially Paid",
    toneClass:
      "border-fuchsia-500/30 bg-black/60 text-white shadow-lg shadow-black/30 hover:border-fuchsia-400/50 hover:bg-black/70",
    countClass: "text-fuchsia-300",
    accentClass: "bg-fuchsia-400/80",
    glowClass: "bg-fuchsia-400/10",
  },
];

function getSummaryLabel(summary?: string) {
  switch (summary) {
    case "pending_completion":
      return "Pending Completion";
    case "awaiting_payment":
      return "Awaiting Payment";
    case "new_orders":
      return "New Orders";
    case "partially_paid":
      return "Partially Paid";
    default:
      return "";
  }
}

function getSummaryCount(
  counts: AdminOrderSummaryCounts,
  key: AdminSummaryKey
) {
  switch (key) {
    case "pending_completion":
      return counts.pendingCompletion;
    case "awaiting_payment":
      return counts.awaitingPayment;
    case "new_orders":
      return counts.newOrders;
    case "partially_paid":
      return counts.partiallyPaid;
  }
}

function buildSummaryHref(
  params: AdminSearchParams,
  summary: AdminSummaryKey | null
) {
  const nextParams = new URLSearchParams();

  if (params.search) nextParams.set("search", params.search);
  if (params.customerKeyword) {
    nextParams.set("customerKeyword", params.customerKeyword);
  }
  if (params.status && params.status !== "ALL") {
    nextParams.set("status", params.status);
  }
  if (params.tuningType && params.tuningType !== "ALL") {
    nextParams.set("tuningType", params.tuningType);
  }
  if (params.orderType && params.orderType !== "ALL") {
    nextParams.set("orderType", params.orderType);
  }
  if (params.source && params.source !== "ALL") {
    nextParams.set("source", params.source);
  }
  if (params.paymentStatus && params.paymentStatus !== "ALL") {
    nextParams.set("paymentStatus", params.paymentStatus);
  }
  if (params.documentType && params.documentType !== "ALL") {
    nextParams.set("documentType", params.documentType);
  }
  if (params.outstandingOnly === "1") {
    nextParams.set("outstandingOnly", "1");
  }
  if (params.dateFrom) nextParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) nextParams.set("dateTo", params.dateTo);
  if (params.success) nextParams.set("success", params.success);
  if (summary) nextParams.set("summary", summary);

  const query = nextParams.toString();
  return query ? `/admin?${query}` : "/admin";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const status = params.status || "ALL";
  const search = params.search || "";
  const customerKeyword = params.customerKeyword || "";
  const tuningType = params.tuningType || "ALL";
  const orderType = params.orderType || "ALL";
  const source = params.source || "ALL";
  const paymentStatus = params.paymentStatus || "ALL";
  const outstandingOnly = params.outstandingOnly === "1";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";
  const page = Math.max(1, Number(params.page || "1") || 1);
  const documentType = params.documentType || "ALL";
  const summary = params.summary || "ALL";
  const activeSummaryLabel = getSummaryLabel(summary);
  const banner = getAdminBanner(params.success);

  const result = (await getAllOrders({
    status,
    search,
    customerKeyword,
    tuningType,
    orderType,
    source,
    paymentStatus,
    outstandingOnly,
    dateFrom,
    dateTo,
    page,
    pageSize: 5,
    documentType,
    summary,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const summaryCounts = await getAdminOrderSummaryCounts({
    search,
    customerKeyword,
    tuningType,
    orderType,
    source,
    outstandingOnly,
    dateFrom,
    dateTo,
    documentType,
  });

  return (
    <section className="section-pad">
      <ClearSuccessParam />
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <p className="mt-4 text-white/70">
          Review ECU / TCU orders, uploaded files, and manage delivery workflow.
        </p>

        {banner ? <Banner data={banner} /> : null}

        <div className="mt-8 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {SUMMARY_CARDS.map((card) => {
              const isActive = summary === card.key;
              const count = getSummaryCount(summaryCounts, card.key);

              return (
                <a
                  key={card.key}
                  href={buildSummaryHref(params, isActive ? null : card.key)}
                  className={`group relative overflow-hidden rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 ${card.toneClass} ${
                    isActive ? "ring-2 ring-white/20" : ""
                  }`}
                >
                  <div className={`absolute left-0 top-0 h-full w-1.5 ${card.accentClass}`} />
                  <div className={`absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl transition duration-200 group-hover:opacity-100 ${card.glowClass}`} />
                  <div className="relative">
                    <div className={`text-4xl font-bold leading-none tracking-tight drop-shadow-sm ${card.countClass}`}>{count}</div>
                    <div className="mt-3 text-sm font-semibold tracking-[0.02em] text-white/95">
                      {card.label}
                    </div>
                    <div className="mt-2 text-xs text-white/65 transition group-hover:text-white/80">
                      {isActive ? "Active filter" : "View details"}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
          <div className="card-rk p-6 text-white/75">
            <p>
              Search by transaction number, customer name, phone number, email, vehicle no, status,
              tuning type, order type, source, document type, or date range to manage customer orders more efficiently.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            {summary !== "ALL" ? <input type="hidden" name="summary" value={summary} /> : null}
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Search Transaction Number
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
                Source
              </label>
              <div className="relative">
                <select
                  name="source"
                  defaultValue={source}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Sources</option>
                  <option value="ONLINE_PORTAL">Online Portal</option>
                  <option value="ADMIN_PORTAL">Admin Portal</option>
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

            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center justify-between gap-3">
              <input type="hidden" name="page" value="1" />

              <label className="inline-flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  name="outstandingOnly"
                  value="1"
                  defaultChecked={outstandingOnly}
                  className="h-4 w-4 rounded border border-white/20 bg-black/20"
                />
                Outstanding Only
              </label>

              <div className="flex flex-wrap items-end gap-3">
                <button
                  type="submit"
                  className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 hover:bg-white/10"
                >
                  Apply
                </button>
                <a
                  href="/admin"
                  className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
                >
                  Reset
                </a>
              </div>
            </div>
          </form>

          {summary !== "ALL" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
              <span>
                Showing: <span className="font-semibold text-white">{activeSummaryLabel}</span>
              </span>
              <a
                href={buildSummaryHref(params, null)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white/70 transition hover:bg-white/10"
              >
                Clear Summary
              </a>
            </div>
          ) : null}

          <OrderTable
            orders={result.orders}
            admin
            transactionView={(documentType === "CN" ? "CN" : documentType === "ALL" ? "ALL" : "ORDER") as "ALL" | "ORDER" | "CN"}
          />

          <PaginationControls
            currentPage={result.currentPage}
            totalPages={result.totalPages}
            basePath="/admin"
            params={{
              status: status !== "ALL" ? status : undefined,
              search: search || undefined,
              customerKeyword: customerKeyword || undefined,
              tuningType: tuningType !== "ALL" ? tuningType : undefined,
              orderType: orderType !== "ALL" ? orderType : undefined,
              source: source !== "ALL" ? source : undefined,
              paymentStatus: paymentStatus !== "ALL" ? paymentStatus : undefined,
              documentType: documentType !== "ALL" ? documentType : undefined,
              outstandingOnly: outstandingOnly ? "1" : undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              success: params.success,
              summary: summary !== "ALL" ? summary : undefined,
            }}
          />
        </div>
      </div>
    </section>
  );
}
