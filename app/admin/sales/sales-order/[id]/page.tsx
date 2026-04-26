import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ success?: string }> };

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(/am|pm/i, (value) => value.toLowerCase());
}

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "CONFIRMED" || status === "COMPLETED") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}


function getSalesRouteByDocType(docType: string | null | undefined) {
  const value = String(docType || "").toUpperCase();
  if (value === "QO") return "quotation";
  if (value === "SO") return "sales-order";
  if (value === "DO") return "delivery-order";
  if (value === "INV") return "sales-invoice";
  if (value === "CS") return "cash-sales";
  if (value === "CN") return "credit-note";
  if (value === "DN") return "debit-note";
  if (value === "DR") return "delivery-return";
  return "";
}

function getSalesDocTypeLabel(docType: string | null | undefined) {
  const value = String(docType || "").toUpperCase();
  if (value === "QO") return "Quotation";
  if (value === "SO") return "Sales Order";
  if (value === "DO") return "Delivery Order";
  if (value === "INV") return "Sales Invoice";
  if (value === "CS") return "Cash Sales";
  if (value === "CN") return "Credit Note";
  if (value === "DN") return "Debit Note";
  if (value === "DR") return "Delivery Return";
  return value || "Transaction";
}

function isActiveSalesTrace(status: string | null | undefined) {
  return String(status || "").toUpperCase() !== "CANCELLED";
}

function ReadonlyField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value} readOnly disabled />
    </div>
  );
}

function ReadonlyTextArea({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label-rk">{label}</label>
      <textarea className="input-rk min-h-[96px] resize-none" value={value} readOnly disabled />
    </div>
  );
}

function AddressPanel({
  title,
  transaction,
}: {
  title: string;
  transaction: {
    billingAddressLine1?: string | null;
    billingAddressLine2?: string | null;
    billingAddressLine3?: string | null;
    billingAddressLine4?: string | null;
    billingCity?: string | null;
    billingPostCode?: string | null;
  };
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ReadonlyField label="Address Line 1" value={transaction.billingAddressLine1 || ""} />
        <ReadonlyField label="Address Line 2" value={transaction.billingAddressLine2 || ""} />
        <ReadonlyField label="Address Line 3" value={transaction.billingAddressLine3 || ""} />
        <ReadonlyField label="Address Line 4" value={transaction.billingAddressLine4 || ""} />
        <ReadonlyField label="City" value={transaction.billingCity || ""} />
        <ReadonlyField label="Post Code" value={transaction.billingPostCode || ""} />
      </div>
    </div>
  );
}

export default async function AdminSalesOrderDetailPage({ params, searchParams }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const successMessage = typeof resolvedSearchParams?.success === "string" ? resolvedSearchParams.success.trim() : "";

  const transaction = await db.salesTransaction.findUnique({
    where: { id },
    include: {
      createdByAdmin: { select: { id: true, name: true, email: true } },
      cancelledByAdmin: { select: { id: true, name: true, email: true } },
      agent: { select: { id: true, code: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true, projectId: true } },
      revisedFrom: { select: { id: true, docNo: true } },
      revisions: { select: { id: true, docNo: true, status: true } },
      sourceLinks: {
        include: {
          sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
        },
      },
      targetLinks: {
        include: {
          targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
        },
      },
      lines: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!transaction || transaction.docType !== "SO") {
    return (
      <section className="section-pad">
        <div className="container-rk max-w-5xl">
          <p className="text-white/70">Sales Order not found.</p>
        </div>
      </section>
    );
  }

  const currency = transaction.currency || "MYR";
  const generatedFromLinks = transaction.sourceLinks
    .map((link) => link.sourceTransaction)
    .filter((item) => item && isActiveSalesTrace(item.status));

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl space-y-6">
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Sales Order</p>
            <h1 className="mt-3 text-4xl font-bold">{transaction.docNo}</h1>
            <p className="mt-4 max-w-3xl text-white/70">View sales order details in read-only mode.</p>
            {transaction.revisedFrom?.docNo ? (
              <Link
                href={`/admin/sales/sales-order/${transaction.revisedFrom.id}`}
                className="mt-3 block w-fit rounded-lg px-2 py-1 text-sm text-white/45 transition hover:bg-white/5 hover:text-white/80"
              >
                ↳ Revision of {transaction.revisedFrom.docNo}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/sales/sales-order" className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">
              Back
            </Link>
            <Link
              href={`/admin/sales/sales-order?edit=${transaction.id}`}
              className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                transaction.status === "CANCELLED"
                  ? "pointer-events-none cursor-not-allowed border border-white/10 bg-white/5 opacity-50"
                  : "border border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              Edit
            </Link>
          </div>
        </div>

        {transaction.status === "CANCELLED" ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-100">
            <div className="font-semibold">This sales order has been cancelled.</div>
            <div className="mt-2">Cancelled At: {formatDate(transaction.cancelledAt)}</div>
            <div className="mt-1">Cancelled By: {transaction.cancelledByAdmin?.name || "-"}</div>
            <div className="mt-1">Reason: {transaction.cancelReason || "-"}</div>
          </div>
        ) : null}


        {generatedFromLinks.length > 0 ? (
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-5 text-sm text-sky-100">
            <div className="font-semibold">Generated From</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {generatedFromLinks.map((source) => {
                const route = getSalesRouteByDocType(source?.docType);
                return route ? (
                  <Link
                    key={source?.id}
                    href={`/admin/sales/${route}/${source?.id}`}
                    className="rounded-xl border border-sky-500/30 bg-black/20 px-3 py-2 transition hover:bg-sky-500/15"
                  >
                    {getSalesDocTypeLabel(source?.docType)}: {source?.docNo} ({source?.status})
                  </Link>
                ) : (
                  <span key={source?.id} className="rounded-xl border border-sky-500/30 bg-black/20 px-3 py-2">
                    {source?.docNo} ({source?.status})
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">Sales Order</p>
              <h2 className="mt-4 text-4xl font-bold">View Sales Order</h2>
              <p className="mt-4 max-w-3xl text-white/70">Use the same sales order layout in read-only mode for easier review and checking.</p>
            </div>
            <div className="grid min-w-[250px] grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs text-white/55">
              <div className="text-right">Created By:</div>
              <div className="text-left font-semibold text-white/75">{transaction.createdByAdmin?.name || "-"}</div>
              <div className="text-right">Created Date:</div>
              <div className="text-left font-semibold text-white/75">{formatDateTime(transaction.createdAt)}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <ReadonlyField label="Doc Date" value={formatDate(transaction.docDate)} />
            <ReadonlyField label="System Doc No" value={transaction.docNo} className="xl:col-span-3" />
            <ReadonlyField label="A/C No" value={transaction.customerAccountNo || ""} />
            <ReadonlyField label="Customer Name" value={transaction.customerName || ""} />
            <ReadonlyField label="Email" value={transaction.email || ""} />
            <ReadonlyField label="Status" value={transaction.status} />
            <ReadonlyField label="Document Description" value={transaction.docDesc || ""} className="xl:col-span-2" />
            <ReadonlyField label="Attention" value={transaction.attention || ""} />
            <ReadonlyField label="Contact No" value={transaction.contactNo || ""} />
            <ReadonlyField label="Agent" value={transaction.agent ? `${transaction.agent.code} — ${transaction.agent.name}` : ""} />
            {transaction.project ? <ReadonlyField label="Project" value={`${transaction.project.code} — ${transaction.project.name}`} /> : null}
            {transaction.department ? <ReadonlyField label="Department" value={`${transaction.department.code} — ${transaction.department.name}`} /> : null}
          </div>

          <div className="mt-6">
            <AddressPanel title="Billing Address" transaction={transaction} />
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <ReadonlyTextArea label="Remarks" value={transaction.remarks || ""} />
            <ReadonlyTextArea label="Footer Remarks" value={transaction.footerRemarks || ""} />
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 p-4">
            <h3 className="text-lg font-bold">Products</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="text-left text-white/45">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">UOM</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Tax Code</th>
                    <th className="px-4 py-3 text-right">Product Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white/80">
                  {transaction.lines.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-white/50">No product line found.</td></tr>
                  ) : (
                    transaction.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-white">{line.productCode}</div>
                          <div className="mt-1 text-xs text-white/50">{line.productDescription}</div>
                          {line.remarks ? <div className="mt-2 text-xs text-white/40">Remarks: {line.remarks}</div> : null}
                        </td>
                        <td className="px-4 py-4">{line.uom}</td>
                        <td className="px-4 py-4 text-right">{money(line.qty)}</td>
                        <td className="px-4 py-4 text-right">{money(line.unitPrice)}</td>
                        <td className="px-4 py-4 text-right">
                          {line.discountType === "AMOUNT" ? `${currency} ${money(line.discountAmount)}` : `${money(line.discountRate)}%`}
                        </td>
                        <td className="px-4 py-4">{line.locationCode ? `${line.locationCode} — ${line.locationName || ""}` : "-"}</td>
                        <td className="px-4 py-4">{line.taxCode || "-"}</td>
                        <td className="px-4 py-4 text-right">{money(line.lineTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <ReadonlyTextArea label="Terms & Conditions" value={transaction.termsAndConditions || ""} />
              <ReadonlyTextArea label="Bank Account" value={transaction.bankAccount || ""} />
            </div>
            <div className="rounded-[1.5rem] border border-white/10 p-5">
              <h3 className="text-xl font-bold">Sales Order Summary</h3>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-white/65">Subtotal</span><span>{money(transaction.subtotal)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/65">Discount</span><span>{money(transaction.discountTotal)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/65">Tax</span><span>{money(transaction.taxTotal)}</span></div>
                <div className="border-t border-white/10 pt-4">
                  <div className="flex justify-between gap-4 text-xl font-bold">
                    <span>Grand Total ({currency})</span>
                    <span>{money(transaction.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {transaction.revisions.length > 0 ? (
            <div className="mt-8 rounded-[1.5rem] border border-white/10 p-4">
              <h3 className="text-lg font-bold">Revision History</h3>
              <div className="mt-3 space-y-2">
                {transaction.revisions.map((revision) => (
                  <Link key={revision.id} href={`/admin/sales/sales-order/${revision.id}`} className="block rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">
                    ↳ Revised to {revision.docNo} ({revision.status})
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
