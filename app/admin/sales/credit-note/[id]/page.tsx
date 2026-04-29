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


function extractSerialNo(value: string | null | undefined) {
  const match = String(value || "").match(/SERIAL_NO=([^|]+)/);
  return match ? match[1].trim() : "";
}

function uniqueText(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function buildBatchExpiryKey(productId?: string | null, batchNo?: string | null) {
  const normalizedProductId = String(productId || "").trim();
  const normalizedBatchNo = String(batchNo || "").trim().toUpperCase();
  if (!normalizedProductId || !normalizedBatchNo) return "";
  return `${normalizedProductId}__${normalizedBatchNo}`;
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

function getSourceDocNos(line: {
  targetLineLinks?: Array<{ sourceTransaction?: { docNo?: string | null } | null }>;
}) {
  const values = (line.targetLineLinks || [])
    .map((link) => link.sourceTransaction?.docNo)
    .filter(Boolean) as string[];
  return values.length > 0 ? values.join(", ") : "-";
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
      agent: { select: { id: true, code: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
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
              sourceLine: { select: { id: true, lineNo: true, qty: true, productCode: true, productDescription: true } },
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

  const currency = transaction.currency || "MYR";
  const sourceInvoices = transaction.targetLinks.map((link) => link.sourceTransaction).filter((source) => source && source.docType === "INV");
  const primarySourceInvoice = sourceInvoices[0] || null;

  const stockLedgerRows = await db.stockLedger.findMany({
    where: { sourceType: "CREDIT_NOTE", sourceId: transaction.id, movementDirection: "IN" },
    orderBy: [{ createdAt: "asc" }],
    select: { inventoryProductId: true, locationId: true, batchNo: true, remarks: true },
  });

  const batchExpiryConditions = new Map<string, { inventoryProductId: string; batchNo: string }>();
  for (const row of stockLedgerRows) {
    const rowBatchKey = buildBatchExpiryKey(row.inventoryProductId, row.batchNo);
    if (rowBatchKey && !batchExpiryConditions.has(rowBatchKey)) {
      batchExpiryConditions.set(rowBatchKey, { inventoryProductId: row.inventoryProductId, batchNo: String(row.batchNo) });
    }
  }

  const batchExpiryRows = batchExpiryConditions.size
    ? await db.inventoryBatch.findMany({
        where: { OR: Array.from(batchExpiryConditions.values()) },
        select: { inventoryProductId: true, batchNo: true, expiryDate: true },
      })
    : [];

  const batchExpiryMap = new Map<string, Date | null>();
  for (const batch of batchExpiryRows) {
    batchExpiryMap.set(buildBatchExpiryKey(batch.inventoryProductId, batch.batchNo), batch.expiryDate ?? null);
  }


  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Credit Note</p>
            <h1 className="mt-3 text-4xl font-bold">{transaction.docNo}</h1>
            <p className="mt-4 max-w-3xl text-white/70">View credit note details in read-only mode.</p>
            {sourceInvoices.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-sky-200">Reflecting to:</span>
                {sourceInvoices.map((source, index) => (
                  <Link key={source?.id} href={`/admin/sales/sales-invoice/${source?.id}`} className="text-sky-200 underline-offset-4 hover:underline">
                    {source?.docNo}{sourceInvoices.length > 1 && index < sourceInvoices.length - 1 ? "," : ""}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/sales/credit-note" className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">
              Back
            </Link>
          </div>
        </div>

        {transaction.status === "CANCELLED" ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-100">
            <div className="font-semibold">This credit note has been cancelled.</div>
            <div className="mt-2">Cancelled At: {formatDate(transaction.cancelledAt)}</div>
            <div className="mt-1">Cancelled By: {transaction.cancelledByAdmin?.name || "-"}</div>
            <div className="mt-1">Reason: {transaction.cancelReason || "-"}</div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">Credit Note</p>
              <h2 className="mt-4 text-4xl font-bold">View Credit Note</h2>
              <p className="mt-4 max-w-3xl text-white/70">Credit Note reduces sales amount and stocks returned items back into inventory.</p>
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
            <ReadonlyField label="Source INV" value={primarySourceInvoice?.docNo || transaction.reference || ""} />
            <ReadonlyField label="Document Description" value={transaction.docDesc || ""} className="xl:col-span-2" />
            <ReadonlyField label="Attention" value={transaction.attention || ""} />
            <ReadonlyField label="Contact No" value={transaction.contactNo || ""} />
            <ReadonlyField label="Agent" value={transaction.agent ? `${transaction.agent.code} — ${transaction.agent.name}` : ""} />
            {transaction.project ? <ReadonlyField label="Project" value={`${transaction.project.code} — ${transaction.project.name}`} /> : null}
            {transaction.department ? <ReadonlyField label="Department" value={`${transaction.department.code} — ${transaction.department.name}`} /> : null}
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <ReadonlyTextArea label="Reason / Remarks" value={transaction.remarks || ""} />
            <ReadonlyTextArea label="Footer Remarks" value={transaction.footerRemarks || ""} />
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 p-4">
            <h3 className="text-lg font-bold">Products</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="text-left text-white/45">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Reflecting To</th>
                    <th className="px-4 py-3">UOM</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3 text-right">Gross Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white/80">
                  {transaction.lines.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">No product line found.</td></tr>
                  ) : (
                    transaction.lines.map((line) => {
                      const ledgerRows = stockLedgerRows.filter((row) =>
                        row.inventoryProductId === line.inventoryProductId && (!line.locationId || row.locationId === line.locationId)
                      );
                      const fallbackLedgerRows = ledgerRows.length > 0 ? ledgerRows : stockLedgerRows.filter((row) => row.inventoryProductId === line.inventoryProductId);
                      const serialNos = uniqueText(fallbackLedgerRows.map((row) => extractSerialNo(row.remarks)).filter(Boolean));
                      const batchNo = fallbackLedgerRows.find((row) => row.batchNo)?.batchNo || null;
                      const batchExpiryDate = batchNo ? batchExpiryMap.get(buildBatchExpiryKey(line.inventoryProductId, batchNo)) || null : null;

                      return (
                      <tr key={line.id}>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-white">{line.productCode}</div>
                          <div className="mt-1 text-xs text-white/50">{line.productDescription}</div>
                          {batchNo ? <div className="mt-2 text-xs text-amber-100/80">Batch No: {batchNo}{batchExpiryDate ? ` (Expiry Date: ${formatDate(batchExpiryDate)})` : ""}</div> : null}
                          {serialNos.length > 0 ? <div className="mt-1 text-xs text-sky-100/80">S/N No: {serialNos.join(", ")}</div> : null}
                          {line.remarks ? <div className="mt-2 text-xs text-white/40">Remarks: {line.remarks}</div> : null}
                        </td>
                        <td className="px-4 py-4">{getSourceDocNos(line)}</td>
                        <td className="px-4 py-4">{line.uom}</td>
                        <td className="px-4 py-4 text-right">{money(line.qty)}</td>
                        <td className="px-4 py-4 text-right">{money(line.unitPrice)}</td>
                        <td className="px-4 py-4">{(line as any).locationCode ? `${(line as any).locationCode} — ${(line as any).locationName || ""}` : "-"}</td>
                        <td className="px-4 py-4 text-right">{money(line.lineTotal)}</td>
                      </tr>
                      );
                    })
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
              <h3 className="text-xl font-bold">Credit Note Summary</h3>
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
        </div>
      </div>
    </section>
  );
}
