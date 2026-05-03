import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ success?: string }> };

const DOC_TYPE = "GRN";
const TITLE = "Goods Received Note";
const LIST_PATH = "/admin/purchase/goods-received-note";

function money(value: unknown) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"; }
function formatDate(value: Date | string | null | undefined) { if (!value) return "-"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "-"; return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" }); }
function formatDateTime(value: Date | string | null | undefined) { if (!value) return "-"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "-"; return date.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).replace(/am|pm/i, (value) => value.toLowerCase()); }
function getStatusClass(status: string) { if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200"; if (status === "COMPLETED") return "border-sky-500/25 bg-sky-500/10 text-sky-200"; if (status === "PARTIAL") return "border-indigo-500/25 bg-indigo-500/10 text-indigo-200"; return "border-amber-500/25 bg-amber-500/10 text-amber-200"; }
function ReadonlyField({ label, value, className = "" }: { label: string; value: string; className?: string }) { return <div className={className}><label className="label-rk">{label}</label><input className="input-rk" value={value} readOnly disabled /></div>; }
function ReadonlyTextArea({ label, value, className = "" }: { label: string; value: string; className?: string }) { return <div className={className}><label className="label-rk">{label}</label><textarea className="input-rk min-h-[96px] resize-none" value={value} readOnly disabled /></div>; }
function purchaseRoute(docType: string | null | undefined) { const value = String(docType || "").toUpperCase(); if (value === "PO") return "purchase-order"; if (value === "GRN") return "goods-received-note"; if (value === "PI") return "purchase-invoice"; return ""; }
function active(item?: { status?: string | null } | null) { return item && String(item.status || "").toUpperCase() !== "CANCELLED"; }

export default async function PurchaseDetailPage({ params, searchParams }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const successMessage = typeof resolvedSearchParams?.success === "string" ? resolvedSearchParams.success.trim() : "";

  const transaction = await db.purchaseTransaction.findUnique({
    where: { id },
    include: {
      createdByAdmin: { select: { id: true, name: true, email: true } },
      cancelledByAdmin: { select: { id: true, name: true, email: true } },
      supplier: { select: { id: true, name: true, supplierAccountNo: true } },
      agent: { select: { id: true, code: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true, projectId: true } },
      revisedFrom: { select: { id: true, docNo: true } },
      revisions: { select: { id: true, docNo: true, status: true } },
      sourceLinks: { include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
      targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
      lines: { orderBy: { lineNo: "asc" }, include: { sourceLineLinks: { include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } }, sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } } } },
    },
  });

  if (!transaction || transaction.docType !== DOC_TYPE) {
    return <section className="section-pad"><div className="container-rk max-w-5xl"><p className="text-white/70">{TITLE} not found.</p></div></section>;
  }

  const currency = transaction.currency || "MYR";
  const generatedFrom = transaction.targetLinks.map((link) => link.sourceTransaction).filter(active);
  const generatedTo = transaction.sourceLinks.map((link) => link.targetTransaction).filter(active);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl space-y-6">
        {successMessage ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMessage}</div> : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">{TITLE}</p>
            <h1 className="mt-3 text-4xl font-bold">{transaction.docNo}</h1>
            <p className="mt-4 max-w-3xl text-white/70">View {TITLE.toLowerCase()} details in read-only mode.</p>
            {generatedFrom.length > 0 ? <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-sky-200">Generated from:</span>{generatedFrom.map((source, index) => { const route = purchaseRoute(source?.docType); const content = `${source?.docNo || "-"}${generatedFrom.length > 1 && index < generatedFrom.length - 1 ? "," : ""}`; return route ? <Link key={source?.id} href={`/admin/purchase/${route}/${source?.id}`} className="text-sky-200 underline-offset-4 hover:underline">{content}</Link> : <span key={source?.id} className="text-sky-200">{content}</span>; })}</div> : null}
            {generatedTo.length > 0 ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="text-sky-200">Generated to:</span>{generatedTo.map((target, index) => { const route = purchaseRoute(target?.docType); const content = `${target?.docNo || "-"}${generatedTo.length > 1 && index < generatedTo.length - 1 ? "," : ""}`; return route ? <Link key={target?.id} href={`/admin/purchase/${route}/${target?.id}`} className="text-sky-200 underline-offset-4 hover:underline">{content}</Link> : <span key={target?.id} className="text-sky-200">{content}</span>; })}</div> : null}
            {transaction.revisedFrom?.docNo ? <Link href={`${LIST_PATH}/${transaction.revisedFrom.id}`} className="mt-3 block w-fit rounded-lg px-2 py-1 text-sm text-white/45 transition hover:bg-white/5 hover:text-white/80">↳ Revision of {transaction.revisedFrom.docNo}</Link> : null}
          </div>
          <div className="flex flex-wrap gap-3"><Link href={LIST_PATH} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Back</Link><Link href={`${LIST_PATH}?edit=${transaction.id}`} className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${transaction.status === "CANCELLED" ? "pointer-events-none cursor-not-allowed border border-white/10 bg-white/5 opacity-50" : "border border-white/15 bg-white/5 hover:bg-white/10"}`}>Edit</Link></div>
        </div>

        <div className="card-rk p-5 md:p-8">
          {transaction.status === "CANCELLED" ? <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-100"><div className="font-semibold">This {TITLE.toLowerCase()} has been cancelled.</div><div className="mt-3 space-y-2 text-white/85"><div>Cancelled At: {formatDateTime(transaction.cancelledAt)}</div><div>Cancelled By: {transaction.cancelledByAdmin?.name || "-"}</div><div>Reason: {transaction.cancelReason || "-"}</div></div></div> : null}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"><ReadonlyField label="Doc No" value={transaction.docNo} /><ReadonlyField label="Doc Date" value={formatDate(transaction.docDate)} /><ReadonlyField label="Status" value={transaction.status} /><ReadonlyField label="Currency" value={currency} /><ReadonlyField label="Supplier A/C No" value={transaction.supplierAccountNo || ""} /><ReadonlyField label="Supplier Name" value={transaction.supplierName || ""} /><ReadonlyField label="Email" value={transaction.email || ""} /><ReadonlyField label="Contact No" value={transaction.contactNo || ""} /><ReadonlyField label="Reference" value={transaction.reference || ""} /><ReadonlyField label="Agent" value={transaction.agent ? `${transaction.agent.code} — ${transaction.agent.name}` : ""} /><ReadonlyField label="Project" value={transaction.project ? `${transaction.project.code} — ${transaction.project.name}` : ""} /><ReadonlyField label="Department" value={transaction.department ? `${transaction.department.code} — ${transaction.department.name}` : ""} /></div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2"><div className="rounded-[1.75rem] border border-white/10 p-5"><h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Billing Address</h3><div className="mt-5 grid gap-4 md:grid-cols-2"><ReadonlyField label="Address Line 1" value={transaction.billingAddressLine1 || ""} /><ReadonlyField label="Address Line 2" value={transaction.billingAddressLine2 || ""} /><ReadonlyField label="Address Line 3" value={transaction.billingAddressLine3 || ""} /><ReadonlyField label="Address Line 4" value={transaction.billingAddressLine4 || ""} /><ReadonlyField label="City" value={transaction.billingCity || ""} /><ReadonlyField label="Post Code" value={transaction.billingPostCode || ""} /></div></div><div className="rounded-[1.75rem] border border-white/10 p-5"><h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Delivery Address</h3><div className="mt-5 grid gap-4 md:grid-cols-2"><ReadonlyField label="Address Line 1" value={transaction.deliveryAddressLine1 || ""} /><ReadonlyField label="Address Line 2" value={transaction.deliveryAddressLine2 || ""} /><ReadonlyField label="Address Line 3" value={transaction.deliveryAddressLine3 || ""} /><ReadonlyField label="Address Line 4" value={transaction.deliveryAddressLine4 || ""} /><ReadonlyField label="City" value={transaction.deliveryCity || ""} /><ReadonlyField label="Post Code" value={transaction.deliveryPostCode || ""} /></div></div></div>
        </div>

        <div className="card-rk overflow-hidden"><div className="border-b border-white/10 px-5 py-4 md:px-8"><h2 className="text-xl font-semibold text-white">Body</h2></div><div className="overflow-x-auto"><table className="min-w-[1080px] text-left text-sm"><thead className="bg-black/30 text-white/45"><tr><th className="px-5 py-4">No.</th><th className="px-5 py-4">Product</th><th className="px-5 py-4">Description</th><th className="px-5 py-4">Qty</th><th className="px-5 py-4">UOM</th><th className="px-5 py-4">Unit Cost</th><th className="px-5 py-4">Location</th><th className="px-5 py-4 text-right">Amount</th></tr></thead><tbody>{transaction.lines.map((line) => (<tr key={line.id} className="border-t border-white/10"><td className="px-5 py-4 text-white/45">{line.lineNo}</td><td className="px-5 py-4 text-white">{line.productCode}</td><td className="px-5 py-4 text-white/75">{line.productDescription}</td><td className="px-5 py-4 text-white/75">{money(line.qty)}</td><td className="px-5 py-4 text-white/75">{line.uom}</td><td className="px-5 py-4 text-white/75">{money(line.unitCost)}</td><td className="px-5 py-4 text-white/75">{line.locationCode ? `${line.locationCode} — ${line.locationName || ""}` : "-"}</td><td className="px-5 py-4 text-right text-white">{money(line.lineTotal)}</td></tr>))}</tbody></table></div></div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><div className="card-rk p-5 md:p-8"><h2 className="text-xl font-semibold text-white">Footer</h2><div className="mt-5 grid gap-4"><ReadonlyTextArea label="Terms & Conditions" value={transaction.termsAndConditions || ""} /><ReadonlyTextArea label="Bank Account" value={transaction.bankAccount || ""} /><ReadonlyTextArea label="Footer Remarks" value={transaction.footerRemarks || ""} /></div></div><div className="card-rk p-5"><h2 className="text-xl font-semibold text-white">Summary</h2><div className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><span className="text-white/60">Subtotal</span><span>{money(transaction.subtotal)}</span></div><div className="flex justify-between"><span className="text-white/60">Discount</span><span>{money(transaction.discountTotal)}</span></div><div className="flex justify-between"><span className="text-white/60">Tax</span><span>{money(transaction.taxTotal)}</span></div><div className="flex justify-between border-t border-white/10 pt-4 text-lg font-bold"><span>Grand Total</span><span>{money(transaction.grandTotal)}</span></div></div></div></div>
      </div>
    </section>
  );
}
