import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { getSupplierByIdWithIntelligence } from "@/lib/queries";
import { redirect, notFound } from "next/navigation";

type DecimalLike = {
  toNumber?: () => number;
  toString?: () => string;
};

function toSafeNumber(value: unknown) {
  if (typeof value === "number") return value;

  if (value && typeof value === "object") {
    const maybeDecimal = value as DecimalLike;

    if (typeof maybeDecimal.toNumber === "function") {
      const converted = maybeDecimal.toNumber();
      return Number.isFinite(converted) ? converted : 0;
    }

    if (typeof maybeDecimal.toString === "function") {
      const converted = Number(maybeDecimal.toString());
      return Number.isFinite(converted) ? converted : 0;
    }
  }

  const converted = Number(value);
  return Number.isFinite(converted) ? converted : 0;
}

function formatCurrency(value: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function getCreditStatusLabel(supplier: any) {
  if (supplier.creditControl?.creditOverdue) return "Overdue";
  if (supplier.creditControl?.creditLimitExceeded) return "Over Limit";
  return "OK";
}

function getCreditStatusClass(supplier: any) {
  if (supplier.creditControl?.creditOverdue)
    return "border-red-500/30 bg-red-500/10 text-red-300";
  if (supplier.creditControl?.creditLimitExceeded)
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

function formatDateTime(value: Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatDocumentDate(value: Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(value);
}

function formatRelativeDate(value: Date | null) {
  if (!value) return "-";

  const now = Date.now();
  const then = value.getTime();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatDateTime(value);
}

type PurchaseHistoryItem = {
  id: string;
  docType: string;
  docNo: string;
  docDate: Date;
  createdAt: Date;
  docDesc: string | null;
  status: string;
  amount: number;
  signedAmount: number;
};

function getDocumentTypeLabel(docType: string) {
  switch (docType) {
    case "INV":
      return "Purchase Invoice";
    case "CS":
      return "Cash Purchase";
    case "DN":
      return "Debit Note";
    case "CN":
      return "Credit Note";
    default:
      return docType || "-";
  }
}

function getDocumentTitle(order: PurchaseHistoryItem) {
  return order.docDesc || getDocumentTypeLabel(order.docType);
}

function getDocumentAmountClass(docType: string) {
  if (docType === "CN") return "text-red-300";
  if (docType === "DN") return "text-amber-200";
  return "text-white";
}

function getDocumentTypeClass(docType: string) {
  if (docType === "CN") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (docType === "DN")
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (docType === "CS") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  return "border-white/15 bg-white/5 text-white/75";
}

function getPurchaseStatusClasses(status: string) {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "CANCELLED":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "PARTIAL":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "OPEN":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    case "PENDING":
      return "border-white/15 bg-white/5 text-white/75";
    default:
      return "border-white/15 bg-white/5 text-white/75";
  }
}

function getPurchaseStatusLabel(status: string) {
  switch (status) {
    case "OPEN":
      return "Open";
    case "PARTIAL":
      return "Partial";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PENDING":
      return "Pending";
    default:
      return status.replaceAll("_", " ");
  }
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
      {children}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm text-white/70">{label}</p>
      <div className="min-h-[46px] rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/80">
        {value || "-"}
      </div>
    </div>
  );
}

function compactAddress(lines: Array<string | null | undefined>) {
  const values = lines.map((line) => String(line || "").trim()).filter(Boolean);
  return values.length > 0 ? values : ["-"];
}

type SupplierDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ transactionPage?: string }>;
};

function buildTransactionPageHref(supplierId: string, page: number) {
  return `/admin/suppliers/${supplierId}?transactionPage=${page}`;
}

export default async function AdminSupplierDetailPage({
  params,
  searchParams,
}: SupplierDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const query = (await searchParams) || {};
  const transactionPage = Math.max(
    1,
    Number(query.transactionPage || "1") || 1,
  );
  const supplier = await getSupplierByIdWithIntelligence(id, {
    transactionPage,
    transactionPageSize: 10,
  });

  if (!supplier) {
    notFound();
  }

  const supplierView = supplier as any;
  const currency = supplier.currency || "MYR";
  const creditControlType =
    Number(supplier.creditControl?.creditTermsDays || 0) > 0
      ? "Credit Terms"
      : Number(supplier.creditControl?.creditLimitAmount || 0) > 0
        ? "Credit Limit"
        : "None";
  const secondaryDeliveryAddresses = Array.isArray(
    supplierView.deliveryAddresses,
  )
    ? supplierView.deliveryAddresses
    : [];
  const purchaseTransactionPagination =
    supplierView.purchaseTransactionPagination || {
      currentPage: 1,
      pageSize: 10,
      totalCount: supplier.orders.length,
      totalPages: 1,
    };
  const firstHistoryRecord =
    purchaseTransactionPagination.totalCount === 0
      ? 0
      : (purchaseTransactionPagination.currentPage - 1) *
          purchaseTransactionPagination.pageSize +
        1;
  const lastHistoryRecord = Math.min(
    purchaseTransactionPagination.currentPage *
      purchaseTransactionPagination.pageSize,
    purchaseTransactionPagination.totalCount,
  );

  return (
    <section className="section-pad">
      <div className="container-rk space-y-8">
        <div className="flex flex-col gap-4">
          <div>
            <Link
              href="/admin/suppliers"
              className="text-sm text-white/50 transition hover:text-white/80"
            >
              ← Back to Suppliers
            </Link>
            <h1 className="mt-3 text-4xl font-bold">{supplier.name}</h1>
            <p className="mt-3 text-white/70">
              Manage supplier details, orders, and tuning records in one place.
            </p>
          </div>
        </div>

        <div className="card-rk p-6 md:p-8">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <SectionTitle>Basic Info</SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <DetailField
                label="A/C No."
                value={supplier.supplierAccountNo || "-"}
              />
              <DetailField label="Supplier Name" value={supplier.name} />
              <DetailField label="Email" value={supplier.email} />
              <DetailField label="Phone 1" value={supplier.phone || "-"} />
              <DetailField label="Phone 2" value={supplier.phone2 || "-"} />
              <DetailField label="Fax" value={supplier.fax || "-"} />
              <DetailField label="Email CC" value={supplier.emailCc || "-"} />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex min-h-[38px] items-center justify-between gap-3">
                <SectionTitle>Billing Address</SectionTitle>
                <div className="h-9 w-9" aria-hidden="true" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-white/75">
                {compactAddress([
                  supplier.billingAddressLine1,
                  supplier.billingAddressLine2,
                  supplier.billingAddressLine3,
                  supplier.billingAddressLine4,
                  [supplier.billingPostCode, supplier.billingCity]
                    .filter(Boolean)
                    .join(" "),
                  supplier.billingCountryCode,
                ]).map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="rounded-xl border border-white/10 bg-black/40 px-4 py-3"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex min-h-[38px] items-center justify-between gap-3">
                <SectionTitle>Default Delivery Address</SectionTitle>
                <div className="h-9 w-9" aria-hidden="true" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-white/75">
                {compactAddress([
                  supplier.deliveryAddressLine1,
                  supplier.deliveryAddressLine2,
                  supplier.deliveryAddressLine3,
                  supplier.deliveryAddressLine4,
                  [supplier.deliveryPostCode, supplier.deliveryCity]
                    .filter(Boolean)
                    .join(" "),
                  supplier.deliveryCountryCode,
                ]).map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="rounded-xl border border-white/10 bg-black/40 px-4 py-3"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {secondaryDeliveryAddresses.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
              <SectionTitle>Secondary Delivery Addresses</SectionTitle>
              <div className="mt-4 space-y-3">
                {secondaryDeliveryAddresses.map(
                  (address: any, index: number) => (
                    <div
                      key={address.id || index}
                      className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70"
                    >
                      <div className="font-semibold text-white">
                        {address.label || `Address ${index + 1}`}
                      </div>
                      <div className="mt-1 break-words">
                        {[
                          address.addressLine1,
                          address.addressLine2,
                          address.addressLine3,
                          address.addressLine4,
                          address.postCode,
                          address.city,
                          address.countryCode,
                        ]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
            <SectionTitle>Business Info</SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <DetailField label="Area" value={supplier.area || "-"} />
              <DetailField label="Currency" value={currency} />
              <DetailField label="Credit Control" value={creditControlType} />
              {creditControlType === "Credit Terms" ? (
                <DetailField
                  label="Credit Terms (Days)"
                  value={`${supplier.creditControl?.creditTermsDays ?? 0} day(s)`}
                />
              ) : null}
              {creditControlType === "Credit Limit" ? (
                <DetailField
                  label={`Credit Limit (${currency})`}
                  value={formatCurrency(
                    Number(supplier.creditControl?.creditLimitAmount || 0),
                    currency,
                  )}
                />
              ) : null}
              <DetailField
                label="Credit Status"
                value={
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getCreditStatusClass(supplier)}`}
                  >
                    {getCreditStatusLabel(supplier)}
                  </span>
                }
              />
              <DetailField
                label={`Outstanding INV (${currency})`}
                value={formatCurrency(
                  Number(supplier.creditControl?.creditOutstandingAmount || 0),
                  currency,
                )}
              />
              <DetailField
                label="Agent"
                value={
                  supplier.agent
                    ? `${supplier.agent.code} — ${supplier.agent.name}`
                    : "No Agent"
                }
              />
              <DetailField
                label="Nature of Business"
                value={supplier.natureOfBusiness || "-"}
              />
              <DetailField
                label="Attention"
                value={supplier.attention || "-"}
              />
              <DetailField
                label="Contact"
                value={supplier.contactPerson || "-"}
              />
              <DetailField
                label="Registration Type"
                value={supplier.registrationIdType || "-"}
              />
              <DetailField
                label="Business Registration No."
                value={supplier.registrationNo || "-"}
              />
              <DetailField
                label="Tax Identification No."
                value={supplier.taxIdentificationNo || "-"}
              />
              <DetailField
                label="Account Source"
                value={
                  supplier.accountSource === "ADMIN"
                    ? "Admin Created"
                    : "Self Registered"
                }
              />
              <DetailField
                label="Portal Access"
                value={supplier.portalAccess ? "Enabled" : "Disabled"}
              />
              <DetailField
                label="Created Date"
                value={formatDateTime(supplier.createdAt)}
              />
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Total Purchases</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {supplier.intelligence.totalPurchases}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Total Payable</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {formatCurrency(supplier.intelligence.totalSpent, currency)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Avg Order Value</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {formatCurrency(
                  supplier.intelligence.averageOrderValue,
                  currency,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Last Order</p>
              <p className="mt-3 text-2xl font-bold text-white">
                {formatRelativeDate(supplier.intelligence.lastOrderDate)}
              </p>
            </div>
          </div>
        </div>

        <div className="card-rk overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5 md:px-8">
            <h2 className="text-2xl font-semibold text-white">
              Purchase Transaction History
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Review Purchase Invoice, Cash Purchase, Debit Note, and Credit Note
              records for this supplier.
            </p>
          </div>

          {supplier.orders.length === 0 ? (
            <div className="px-6 py-12 text-center text-white/55 md:px-8">
              No purchase transactions found for this supplier yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-white/80">
                <thead className="bg-black/30 text-white/50">
                  <tr>
                    <th className="px-6 py-4 font-medium md:px-8">Doc No.</th>
                    <th className="px-6 py-4 font-medium">Description</th>
                    <th className="px-6 py-4 font-medium">Document Type</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Doc Date</th>
                    <th className="px-6 py-4 font-medium">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {(supplier.orders as PurchaseHistoryItem[]).map((order) => {
                    const signedAmount = Number(order.signedAmount || 0);
                    const amountDisplay = formatCurrency(
                      Math.abs(signedAmount),
                      currency,
                    );

                    return (
                      <tr
                        key={order.id}
                        className={`border-t border-white/10 align-top ${order.status === "CANCELLED" || order.docType === "CN" ? "bg-red-500/[0.03] text-white/55" : ""}`}
                      >
                        <td className="px-6 py-5 md:px-8">
                          <div className="font-medium text-white">
                            {order.docNo}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-medium text-white">
                            {getDocumentTitle(order)}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getDocumentTypeClass(order.docType)}`}
                          >
                            {getDocumentTypeLabel(order.docType)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getPurchaseStatusClasses(order.status)}`}
                          >
                            {getPurchaseStatusLabel(order.status)}
                          </span>
                        </td>
                        <td
                          className={`px-6 py-5 font-medium ${getDocumentAmountClass(order.docType)}`}
                        >
                          {order.docType === "CN"
                            ? `-${amountDisplay}`
                            : amountDisplay}
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {formatDocumentDate(order.docDate)}
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {formatDateTime(order.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {purchaseTransactionPagination.totalCount > 0 ? (
            <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-sm text-white/55 md:flex-row md:items-center md:justify-between md:px-8">
              <div>
                Showing {firstHistoryRecord}–{lastHistoryRecord} of{" "}
                {purchaseTransactionPagination.totalCount} transaction(s)
              </div>

              {purchaseTransactionPagination.totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  {purchaseTransactionPagination.currentPage > 1 ? (
                    <Link
                      href={buildTransactionPageHref(
                        id,
                        purchaseTransactionPagination.currentPage - 1,
                      )}
                      className="rounded-xl border border-white/15 px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="cursor-not-allowed rounded-xl border border-white/10 px-4 py-2 text-white/30">
                      Previous
                    </span>
                  )}

                  <span className="px-2 text-white/45">
                    Page {purchaseTransactionPagination.currentPage} of{" "}
                    {purchaseTransactionPagination.totalPages}
                  </span>

                  {purchaseTransactionPagination.currentPage <
                  purchaseTransactionPagination.totalPages ? (
                    <Link
                      href={buildTransactionPageHref(
                        id,
                        purchaseTransactionPagination.currentPage + 1,
                      )}
                      className="rounded-xl border border-white/15 px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="cursor-not-allowed rounded-xl border border-white/10 px-4 py-2 text-white/30">
                      Next
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
