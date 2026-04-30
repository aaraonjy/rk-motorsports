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

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
}

export default async function AdminDeliveryReturnDetailPage({ params }: Params) {
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
      targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          sourceLineLinks: {
            include: {
              sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } },
              sourceLine: { select: { id: true, lineNo: true, qty: true } },
            },
          },
        },
      },
    },
  });

  if (!transaction || transaction.docType !== "DR") redirect("/admin/sales/delivery-return");
  const sourceDoc = transaction.targetLinks?.[0]?.sourceTransaction;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link href="/admin/sales/delivery-return" className="text-sm text-white/55 transition hover:text-white">← Back to Delivery Return</Link>
          <h1 className="mt-3 text-3xl font-bold">Delivery Return {transaction.docNo}</h1>
          <p className="mt-2 text-white/60">View posted delivery return details.</p>
        </div>
        <span className={`rounded-full border px-4 py-2 text-xs font-semibold ${getStatusClass(transaction.status)}`}>{transaction.status}</span>
      </div>

      <div className="card-rk p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div><div className="text-xs uppercase tracking-wide text-white/40">Doc Date</div><div className="mt-1 text-white">{formatDate(transaction.docDate)}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-white/40">Customer</div><div className="mt-1 text-white">{transaction.customerName}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-white/40">Source DO</div><div className="mt-1 text-white">{sourceDoc ? <Link className="text-sky-200 hover:text-sky-100" href={`/admin/sales/delivery-order/${sourceDoc.id}`}>{sourceDoc.docNo}</Link> : "-"}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-white/40">Reference</div><div className="mt-1 text-white">{transaction.reference || "-"}</div></div>
        </div>
      </div>

      <div className="card-rk mt-6 overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4 text-lg font-semibold">Returned Products</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/45">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">UOM</th><th className="px-4 py-3 text-right">Returned Qty</th><th className="px-4 py-3">Remarks</th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {transaction.lines.map((line) => (
                <tr key={line.id} className="text-white/80">
                  <td className="px-4 py-4"><div className="font-semibold text-white">{line.productCode}</div><div className="text-xs text-white/50">{line.productDescription}</div></td>
                  <td className="px-4 py-4">{line.uom}</td>
                  <td className="px-4 py-4 text-right">{money(line.qty)}</td>
                  <td className="px-4 py-4 text-white/55">{line.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
