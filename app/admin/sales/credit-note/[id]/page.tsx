import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
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
  if (status === "COMPLETED") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
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

export default async function AdminCreditNoteDetailPage({ params }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const transaction = await db.salesTransaction.findUnique({
    where: { id },
    include: {
      createdByAdmin: { select: { id: true, name: true, email: true } },
      cancelledByAdmin: { select: { id: true, name: true, email: true } },
      targetLinks: {
        include: {
          sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
        },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          targetLineLinks: {
            include: {
              sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
              sourceLine: { select: { id: true, lineNo: true, productCode: true, productDescription: true } },
            },
          },
        },
      },
    },
  });

  if (!transaction || transaction.docType !== "CN") {
    return (
      <section className="section-pad">
        <div className="container-rk max-w-5xl">
          <p className="text-white/70">Credit Note not found.</p>
        </div>
      </section>
    );
  }

  const sourceInvoice = transaction.targetLinks?.[0]?.sourceTransaction || null;

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/admin/sales/credit-note" className="text-sm text-white/55 transition hover:text-white">← Back to Credit Note</Link>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Credit Note Preview</h1>
            <p className="mt-3 text-sm text-white/70">Credit Note reduces sales amount and stocks returned items back into inventory.</p>
          </div>
          <span className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-bold ${getStatusClass(transaction.status)}`}>
            {transaction.status}
          </span>
        </div>

        {transaction.status === "CANCELLED" ? (
          <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
            <div className="font-semibold">This Credit Note has been cancelled.</div>
            <div className="mt-3 space-y-2 text-white/85">
              <div>Cancelled At: {formatDateTime(transaction.cancelledAt)}</div>
              <div>Cancelled By: {transaction.cancelledByAdmin?.name || "-"}</div>
              <div>Reason: {transaction.cancelReason || "-"}</div>
            </div>
          </div>
        ) : null}

        <div className="card-rk p-8">
          <div className="grid gap-5 md:grid-cols-3">
            <ReadonlyField label="Credit Note No" value={transaction.docNo} />
            <ReadonlyField label="Doc Date" value={formatDate(transaction.docDate)} />
            <ReadonlyField label="Source Invoice" value={sourceInvoice?.docNo || transaction.reference || "-"} />
            <ReadonlyField label="Customer" value={transaction.customerName} />
            <ReadonlyField label="Account No" value={transaction.customerAccountNo || "-"} />
            <ReadonlyField label="Currency" value={transaction.currency || "MYR"} />
            <ReadonlyTextArea label="Reason / Remarks" value={transaction.remarks || "-"} className="md:col-span-3" />
          </div>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-4 py-4">No</th>
                  <th className="px-4 py-4">Product</th>
                  <th className="px-4 py-4 text-right">Qty</th>
                  <th className="px-4 py-4 text-right">Unit Price</th>
                  <th className="px-4 py-4 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transaction.lines.map((line) => (
                  <tr key={line.id} className="text-white/85">
                    <td className="px-4 py-4">{line.lineNo}</td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{line.productCode}</div>
                      <div className="mt-1 text-xs text-white/45">{line.productDescription}</div>
                    </td>
                    <td className="px-4 py-4 text-right">{money(line.qty)} {line.uom}</td>
                    <td className="px-4 py-4 text-right">{money(line.unitPrice)}</td>
                    <td className="px-4 py-4 text-right font-semibold">{money(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-end">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 p-5">
              <div className="flex justify-between text-white/70"><span>Subtotal</span><span>{money(transaction.subtotal)}</span></div>
              <div className="mt-3 flex justify-between text-white/70"><span>Discount</span><span>{money(transaction.discountTotal)}</span></div>
              <div className="mt-3 flex justify-between text-white/70"><span>Tax</span><span>{money(transaction.taxTotal)}</span></div>
              <div className="mt-5 border-t border-white/10 pt-5 flex justify-between text-xl font-bold text-white">
                <span>Grand Total ({transaction.currency || "MYR"})</span>
                <span>{money(transaction.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
            Credit Note has no Edit or Edit Revise action. If the CN is wrong, cancel it and create a new Credit Note.
          </div>
        </div>
      </div>
    </section>
  );
}
