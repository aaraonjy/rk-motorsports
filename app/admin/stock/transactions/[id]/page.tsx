import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatNumberByDecimalPlaces,
  normalizeMoneyDecimalPlaces,
  normalizeQtyDecimalPlaces,
} from "@/lib/stock-format";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ success?: string }> };

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(value: Date | string | null | undefined) {
  const formatted = formatDate(value);
  return formatted || "-";
}

function getBackHref(type: "OB" | "SR" | "SI" | "SA" | "ST" | "AS") {
  switch (type) {
    case "OB":
      return "/admin/stock/opening-stock";
    case "SR":
      return "/admin/stock/stock-receive";
    case "SI":
      return "/admin/stock/stock-issue";
    case "SA":
      return "/admin/stock/stock-adjustment";
    case "ST":
      return "/admin/stock/stock-transfer";
    case "AS":
      return "/admin/stock/stock-assembly";
    default:
      return "/admin/stock/opening-stock";
  }
}

function getTypeLabel(type: "OB" | "SR" | "SI" | "SA" | "ST" | "AS") {
  switch (type) {
    case "OB":
      return "Opening Stock";
    case "SR":
      return "Stock Receive";
    case "SI":
      return "Stock Issue";
    case "SA":
      return "Stock Adjustment";
    case "ST":
      return "Stock Transfer";
    case "AS":
      return "Stock Assembly";
    default:
      return "Stock Transaction";
  }
}

function formatQty(value: number | string | null | undefined, decimalPlaces: number) {
  return formatNumberByDecimalPlaces(value, decimalPlaces);
}

function formatMoney(value: number | string | null | undefined, decimalPlaces: number) {
  return formatNumberByDecimalPlaces(value, decimalPlaces);
}

function formatLocationLabel(line: {
  location?: { code: string; name: string } | null;
  fromLocation?: { code: string; name: string } | null;
  toLocation?: { code: string; name: string } | null;
}) {
  if (line.location) return `${line.location.code} — ${line.location.name}`;
  if (line.fromLocation && line.toLocation) {
    return `${line.fromLocation.code} — ${line.fromLocation.name} → ${line.toLocation.code} — ${line.toLocation.name}`;
  }
  if (line.fromLocation) return `${line.fromLocation.code} — ${line.fromLocation.name}`;
  if (line.toLocation) return `${line.toLocation.code} — ${line.toLocation.name}`;
  return "";
}

function ReadonlyField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value} readOnly disabled />
    </div>
  );
}

function ReadonlyTextArea({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label-rk">{label}</label>
      <textarea className="input-rk min-h-[96px] resize-none" value={value} readOnly disabled />
    </div>
  );
}

export default async function AdminStockTransactionDetailPage({ params, searchParams }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const successMessage = typeof resolvedSearchParams?.success === "string" ? resolvedSearchParams.success.trim() : "";

  const stockConfigRecord = await db.stockConfiguration.findUnique({ where: { id: "default" } });
  const stockNumberFormat = {
    qtyDecimalPlaces: normalizeQtyDecimalPlaces(stockConfigRecord?.qtyDecimalPlaces),
    unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(stockConfigRecord?.unitCostDecimalPlaces),
    priceDecimalPlaces: normalizeMoneyDecimalPlaces(stockConfigRecord?.priceDecimalPlaces),
  };

  const transaction = await db.stockTransaction.findUnique({
    where: { id },
    include: {
      createdByAdmin: { select: { id: true, name: true, email: true } },
      cancelledByAdmin: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true, projectId: true } },
      revisedFrom: { select: { id: true, docNo: true } },
      lines: {
        include: {
          inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
          location: { select: { id: true, code: true, name: true } },
          fromLocation: { select: { id: true, code: true, name: true } },
          toLocation: { select: { id: true, code: true, name: true } },
          serialEntries: { orderBy: [{ serialNo: "asc" }], select: { id: true, serialNo: true } },
          ledgerEntries: {
            orderBy: [{ createdAt: "asc" }],
            include: { location: { select: { id: true, code: true, name: true } } },
          },
        },
      },
    },
  });

  if (!transaction) {
    return (
      <section className="section-pad">
        <div className="container-rk max-w-5xl">
          <p className="text-white/70">Stock transaction not found.</p>
        </div>
      </section>
    );
  }

  const title = getTypeLabel(transaction.transactionType);
  const intro = "View stock transaction details in read-only mode.";

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
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Stock Transaction</p>
            <h1 className="mt-3 text-4xl font-bold">{transaction.docNo || transaction.transactionNo}</h1>
            <p className="mt-4 max-w-3xl text-white/70">{intro}</p>
            {transaction.revisedFrom?.docNo ? (
              <Link
                href={`/admin/stock/transactions/${transaction.revisedFrom.id}`}
                className="mt-3 block w-fit rounded-lg px-2 py-1 text-sm text-white/45 transition hover:bg-white/5 hover:text-white/80"
              >
                ↳ Revision of {transaction.revisedFrom.docNo}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={getBackHref(transaction.transactionType)}
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
            >
              Back
            </Link>
            <Link
              href={`/admin/stock/transactions/${transaction.id}/edit`}
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
            <div className="font-semibold">This transaction has been cancelled.</div>
            <div className="mt-2">Cancelled At: {formatDateDisplay(transaction.cancelledAt)}</div>
            <div className="mt-1">Cancelled By: {transaction.cancelledByAdmin?.name || "-"}</div>
            <div className="mt-1">Reason: {transaction.cancelReason || "-"}</div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">{title}</p>
          <h2 className="mt-4 text-4xl font-bold">View {title}</h2>
          <p className="mt-4 max-w-3xl text-white/70">
            Use the same transaction layout in read-only mode for easier review and checking.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <ReadonlyField label="Transaction Date" value={formatDateDisplay(transaction.transactionDate)} />
            <ReadonlyField label="Document Date" value={formatDateDisplay(transaction.docDate || transaction.transactionDate)} />
            <ReadonlyField
              label="System Doc No"
              value={transaction.docNo || transaction.transactionNo || ""}
              className="xl:col-span-2"
            />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <ReadonlyField
              label="Document Description"
              value={transaction.docDesc || ""}
              className={transaction.project || transaction.department ? "md:col-span-2" : "xl:col-span-4 md:col-span-2"}
            />
            {transaction.project ? (
              <ReadonlyField
                label="Project"
                value={`${transaction.project.code} — ${transaction.project.name}`}
                className={transaction.department ? "" : "xl:col-span-2"}
              />
            ) : null}
            {transaction.department ? (
              <ReadonlyField label="Department" value={`${transaction.department.code} — ${transaction.department.name}`} />
            ) : null}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <ReadonlyField label="Reference" value={transaction.reference || ""} />
            <ReadonlyField label="Remarks" value={transaction.remarks || ""} />
          </div>

          <div className="mt-8 space-y-5">
            {transaction.lines.map((line, index) => {
              const productLabel = `${line.inventoryProduct.code} — ${line.inventoryProduct.description}`;
              const qtyValue = formatQty(Number(line.qty), stockNumberFormat.qtyDecimalPlaces);
              const unitCostValue =
                line.unitCost == null ? "" : formatMoney(Number(line.unitCost), stockNumberFormat.unitCostDecimalPlaces);
              const locationLabel = formatLocationLabel(line);
              const serialLabel = line.serialEntries.length ? line.serialEntries.map((item) => item.serialNo).join(", ") : "";

              return (
                <div key={line.id} className="rounded-[1.75rem] border border-white/10 p-5">
                  <div className="text-xl font-semibold text-white">Product {index + 1}</div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <ReadonlyField label="Product" value={productLabel} className="md:col-span-2" />
                    <ReadonlyField label="Qty" value={qtyValue} />
                    <ReadonlyField label="Unit Cost" value={unitCostValue} />
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <ReadonlyField label="Location" value={locationLabel} />
                    <ReadonlyField label="Batch" value={line.batchNo || ""} />
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <ReadonlyTextArea label="Serial No" value={serialLabel} />
                    <ReadonlyTextArea label="Product Remarks" value={line.remarks || ""} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-white/10 p-5">
            <h3 className="text-2xl font-semibold text-white">Ledger Impact</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead>
                  <tr className="text-left text-white/45">
                    <th className="px-3 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium">Direction</th>
                    <th className="px-3 py-3 font-medium text-right">Qty</th>
                    <th className="px-3 py-3 font-medium">Location</th>
                    <th className="px-3 py-3 font-medium">Batch</th>
                    <th className="px-3 py-3 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {transaction.lines.flatMap((line) =>
                    line.ledgerEntries.map((ledger) => (
                      <tr key={ledger.id}>
                        <td className="px-3 py-3 text-white">
                          {line.inventoryProduct.code} — {line.inventoryProduct.description}
                        </td>
                        <td className="px-3 py-3 text-white/80">{ledger.movementDirection}</td>
                        <td className="px-3 py-3 text-right text-white">
                          {formatQty(Number(ledger.qty), stockNumberFormat.qtyDecimalPlaces)}
                        </td>
                        <td className="px-3 py-3 text-white/75">
                          {ledger.location ? `${ledger.location.code} — ${ledger.location.name}` : "-"}
                        </td>
                        <td className="px-3 py-3 text-white/75">{ledger.batchNo || "-"}</td>
                        <td className="px-3 py-3 text-white/75">{ledger.remarks || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={getBackHref(transaction.transactionType)}
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
            >
              Back
            </Link>
            <Link
              href={`/admin/stock/transactions/${transaction.id}/edit`}
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
      </div>
    </section>
  );
}
