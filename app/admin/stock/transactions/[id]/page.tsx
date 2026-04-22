import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatNumberByDecimalPlaces,
  normalizeMoneyDecimalPlaces,
  normalizeQtyDecimalPlaces,
} from "@/lib/stock-format";

type Params = { params: Promise<{ id: string }> };

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
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

function formatQty(value: number | string | null | undefined, decimalPlaces: number) {
  return formatNumberByDecimalPlaces(value, decimalPlaces);
}

function formatMoney(value: number | string | null | undefined, decimalPlaces: number) {
  return `RM ${formatNumberByDecimalPlaces(value, decimalPlaces)}`;
}

export default async function AdminStockTransactionDetailPage({ params }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
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
      revisedFrom: { select: { id: true, transactionNo: true } },
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

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Stock Transaction</p>
            <h1 className="mt-3 text-4xl font-bold">{transaction.docNo || transaction.transactionNo}</h1>
            <p className="mt-4 text-white/70">View stock transaction detail, line items, serials, and ledger impact.</p>
            <p className="mt-2 text-sm text-white/45">Internal Transaction No: {transaction.transactionNo}</p>
            {transaction.revisedFrom ? (
              <Link
                href={`/admin/stock/transactions/${transaction.revisedFrom.id}`}
                className="mt-3 inline-flex text-sm text-white/50 transition hover:text-white/80"
              >
                ↳ Revision of {transaction.revisedFrom.transactionNo}
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

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">Status</p>
            <p className="mt-3 text-lg font-bold text-white">{transaction.status === "CANCELLED" ? "Cancelled" : "Posted"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">Document Date</p>
            <p className="mt-3 text-lg font-bold text-white">{formatDate(transaction.docDate || transaction.transactionDate)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">Reference</p>
            <p className="mt-3 text-lg font-bold text-white">{transaction.reference || "-"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">Created By</p>
            <p className="mt-3 text-lg font-bold text-white">{transaction.createdByAdmin?.name || "-"}</p>
          </div>
        </div>

        {transaction.status === "CANCELLED" ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-100">
            <div className="font-semibold">This transaction has been cancelled.</div>
            <div className="mt-2">Cancelled At: {formatDate(transaction.cancelledAt)}</div>
            <div className="mt-1">Cancelled By: {transaction.cancelledByAdmin?.name || "-"}</div>
            <div className="mt-1">Reason: {transaction.cancelReason || "-"}</div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-white">Products</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-white/45">
                  <th className="px-3 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 font-medium text-right">Qty</th>
                  <th className="px-3 py-3 font-medium text-right">Unit Cost</th>
                  <th className="px-3 py-3 font-medium">Batch</th>
                  <th className="px-3 py-3 font-medium">Location</th>
                  <th className="px-3 py-3 font-medium">Serial No</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transaction.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-3 text-white">
                      <div className="font-medium">{line.inventoryProduct.code}</div>
                      <div className="text-white/60">{line.inventoryProduct.description}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-white">
                      {formatQty(Number(line.qty ?? 0), stockNumberFormat.qtyDecimalPlaces)}
                    </td>
                    <td className="px-3 py-3 text-right text-white">
                      {line.unitCost == null ? "-" : formatMoney(Number(line.unitCost), stockNumberFormat.unitCostDecimalPlaces)}
                    </td>
                    <td className="px-3 py-3 text-white/75">{line.batchNo || "-"}</td>
                    <td className="px-3 py-3 text-white/75">
                      {line.location
                        ? `${line.location.code} — ${line.location.name}`
                        : line.fromLocation && line.toLocation
                          ? `${line.fromLocation.code} — ${line.fromLocation.name} → ${line.toLocation.code} — ${line.toLocation.name}`
                          : "-"}
                    </td>
                    <td className="px-3 py-3 text-white/75">
                      {line.serialEntries.length ? line.serialEntries.map((item) => item.serialNo).join(", ") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-white">Ledger Impact</h2>
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
                  line.ledgerEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-3 text-white">
                        {line.inventoryProduct.code} — {line.inventoryProduct.description}
                      </td>
                      <td className="px-3 py-3 text-white/75">{entry.movementDirection}</td>
                      <td className="px-3 py-3 text-right text-white">
                        {formatQty(Number(entry.qty ?? 0), stockNumberFormat.qtyDecimalPlaces)}
                      </td>
                      <td className="px-3 py-3 text-white/75">
                        {entry.location ? `${entry.location.code} — ${entry.location.name}` : "-"}
                      </td>
                      <td className="px-3 py-3 text-white/75">{entry.batchNo || "-"}</td>
                      <td className="px-3 py-3 text-white/75">{entry.remarks || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
