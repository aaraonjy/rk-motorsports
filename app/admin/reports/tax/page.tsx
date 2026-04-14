import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type TaxReportPageProps = {
  searchParams?: Promise<{
    taxCode?: string;
    transactionType?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

type TaxReportRow = {
  id: string;
  date: Date;
  docNo: string;
  transactionType: "CS" | "INV" | "CN";
  referenceInvoiceNo: string;
  customerName: string;
  itemDescription: string;
  qty: number;
  unitPrice: number;
  taxableAmount: number;
  taxCode: string;
  taxRate: number;
  taxAmount: number;
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

function buildQueryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim().length > 0 && value !== "ALL") {
      searchParams.set(key, value);
    }
  });

  return searchParams.toString();
}

function getInvoiceTransactionType(order: any): "CS" | "INV" {
  return String(order.docType || "").toUpperCase() === "CS" ? "CS" : "INV";
}

function getOrderLineItemTaxRows(order: any): TaxReportRow[] {
  const orderDate = new Date(order.documentDate ?? order.createdAt);
  const rows: TaxReportRow[] = [];

  const hasLineItemTax = Array.isArray(order.customItems) && order.customItems.some(
    (item: any) => Boolean(item.taxCode) && Number(item.taxAmount ?? 0) > 0
  );

  if (hasLineItemTax) {
    for (const item of order.customItems) {
      const taxAmount = Number(item.taxAmount ?? 0);
      const taxCode = String(item.taxCode ?? "").trim();
      if (!taxCode || taxAmount <= 0) continue;

      rows.push({
        id: `order-item-${item.id}`,
        date: orderDate,
        docNo: order.orderNumber,
        transactionType: getInvoiceTransactionType(order),
        referenceInvoiceNo: "-",
        customerName: order.user?.name || "-",
        itemDescription: item.description || "-",
        qty: Number(item.qty ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        taxableAmount: Number(item.lineTotal ?? 0),
        taxCode,
        taxRate: Number(item.taxRate ?? 0),
        taxAmount,
      });
    }
    return rows;
  }

  const orderTaxAmount = Number(order.taxAmount ?? 0);
  const orderTaxCode = String(order.taxCode ?? "").trim();

  if (orderTaxCode && orderTaxAmount > 0) {
    rows.push({
      id: `order-${order.id}`,
      date: orderDate,
      docNo: order.orderNumber,
      transactionType: getInvoiceTransactionType(order),
      referenceInvoiceNo: "-",
      customerName: order.user?.name || "-",
      itemDescription: order.customTitle || order.selectedTuneLabel || "Order Tax",
      qty: 1,
      unitPrice: Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0),
      taxableAmount: Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0),
      taxCode: orderTaxCode,
      taxRate: Number(order.taxRate ?? 0),
      taxAmount: orderTaxAmount,
    });
  }

  return rows;
}

function getCreditNoteTaxRows(order: any): TaxReportRow[] {
  if (!order.creditNote) return [];

  const cnDate = new Date(order.creditNote.cnDate);
  const rows: TaxReportRow[] = [];

  const hasLineItemTax = Array.isArray(order.customItems) && order.customItems.some(
    (item: any) => Boolean(item.taxCode) && Number(item.taxAmount ?? 0) > 0
  );

  if (hasLineItemTax) {
    for (const item of order.customItems) {
      const taxAmount = Number(item.taxAmount ?? 0);
      const taxCode = String(item.taxCode ?? "").trim();
      if (!taxCode || taxAmount <= 0) continue;

      rows.push({
        id: `cn-item-${order.creditNote.id}-${item.id}`,
        date: cnDate,
        docNo: order.creditNote.cnNo,
        transactionType: "CN",
        referenceInvoiceNo: order.orderNumber,
        customerName: order.user?.name || "-",
        itemDescription: item.description || "-",
        qty: Number(item.qty ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        taxableAmount: -Math.abs(Number(item.lineTotal ?? 0)),
        taxCode,
        taxRate: Number(item.taxRate ?? 0),
        taxAmount: -Math.abs(taxAmount),
      });
    }
    return rows;
  }

  const orderTaxAmount = Number(order.taxAmount ?? 0);
  const orderTaxCode = String(order.taxCode ?? "").trim();

  if (orderTaxCode && orderTaxAmount > 0) {
    rows.push({
      id: `cn-${order.creditNote.id}`,
      date: cnDate,
      docNo: order.creditNote.cnNo,
      transactionType: "CN",
      referenceInvoiceNo: order.orderNumber,
      customerName: order.user?.name || "-",
      itemDescription: order.customTitle || order.selectedTuneLabel || "Credit Note Tax Reversal",
      qty: 1,
      unitPrice: Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0),
      taxableAmount: -Math.abs(Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0)),
      taxCode: orderTaxCode,
      taxRate: Number(order.taxRate ?? 0),
      taxAmount: -Math.abs(orderTaxAmount),
    });
  }

  return rows;
}

function buildTaxReportRows(orders: any[], filters: { taxCode?: string; transactionType?: string; dateFrom?: string; dateTo?: string; }) {
  const rows: TaxReportRow[] = [];

  for (const order of orders) {
    const invoiceRows = order.status === "CANCELLED" ? [] : getOrderLineItemTaxRows(order);
    const creditNoteRows = getCreditNoteTaxRows(order);

    for (const row of [...invoiceRows, ...creditNoteRows]) {
      if (!isWithinDateRange(row.date, filters.dateFrom, filters.dateTo)) continue;
      if (filters.taxCode && filters.taxCode !== "ALL" && row.taxCode !== filters.taxCode) continue;
      if (filters.transactionType && filters.transactionType !== "ALL" && row.transactionType !== filters.transactionType) continue;
      rows.push(row);
    }
  }

  return rows.sort((a, b) => {
    const dateDiff = b.date.getTime() - a.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.docNo.localeCompare(b.docNo);
  });
}

export default async function TaxReportPage({ searchParams }: TaxReportPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const taxCode = params.taxCode || "ALL";
  const transactionType = params.transactionType || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const [orders, taxCodes] = await Promise.all([
    db.order.findMany({
      where: {
        OR: [
          { taxAmount: { gt: 0 } },
          {
            customItems: {
              some: {
                taxAmount: { gt: 0 },
              },
            },
          },
          {
            creditNote: {
              isNot: null,
            },
          },
        ],
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        customItems: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            description: true,
            qty: true,
            unitPrice: true,
            lineTotal: true,
            taxCode: true,
            taxRate: true,
            taxAmount: true,
          },
        },
        creditNote: {
          select: {
            id: true,
            cnNo: true,
            cnDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { code: true },
    }),
  ]);

  const rows = buildTaxReportRows(orders, { taxCode, transactionType, dateFrom, dateTo });

  const totalTaxableAmount = rows.reduce((sum, row) => sum + row.taxableAmount, 0);
  const totalTaxAmount = rows.reduce((sum, row) => sum + row.taxAmount, 0);

  const exportQuery = buildQueryString({
    taxCode,
    transactionType,
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

        <h1 className="mt-3 text-4xl font-bold">Tax Report</h1>
        <p className="mt-4 text-white/70">
          Review tax rows by invoice and credit note. Credit Notes are shown as negative rows so the report reflects net taxable amount and net tax correctly.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Use this report for SST review by tax code. Transaction-based invoices are shown as one summary row. Line-item tax invoices are shown item by item. Credit Notes are included as negative rows automatically.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm text-white/65">Tax Code</label>
              <div className="relative">
                <select
                  name="taxCode"
                  defaultValue={taxCode}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Tax Codes</option>
                  {taxCodes.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Transaction Type</label>
              <div className="relative">
                <select
                  name="transactionType"
                  defaultValue={transactionType}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Types</option>
                  <option value="INV">Invoice</option>
                  <option value="CS">Cash Sale</option>
                  <option value="CN">Credit Note</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Date From</label>
              <input
                type="date"
                name="dateFrom"
                defaultValue={dateFrom}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">Date To</label>
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
                href="/admin/reports/tax"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </Link>
              <a
                href={exportQuery ? `/api/reports/tax?${exportQuery}` : "/api/reports/tax"}
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/85 hover:bg-white/10"
              >
                Export CSV
              </a>
            </div>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card-rk p-6">
              <div className="text-sm text-white/50">Net Taxable Amount</div>
              <div className={`mt-2 text-3xl font-bold ${totalTaxableAmount < 0 ? "text-red-300" : "text-white"}`}>
                {formatCurrency(totalTaxableAmount)}
              </div>
            </div>
            <div className="card-rk p-6">
              <div className="text-sm text-white/50">Net Tax Amount</div>
              <div className={`mt-2 text-3xl font-bold ${totalTaxAmount < 0 ? "text-red-300" : "text-amber-200"}`}>
                {formatCurrency(totalTaxAmount)}
              </div>
            </div>
          </div>

          <div className="card-rk overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Report Preview</h2>
                <p className="mt-2 text-sm text-white/60">
                  Showing {rows.length} tax row{rows.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center text-white/55">
                No tax report data found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-white/80">
                  <thead className="bg-black/30 text-white/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Doc No.</th>
                      <th className="px-6 py-4 font-medium">Type</th>
                      <th className="px-6 py-4 font-medium">Reference Invoice</th>
                      <th className="px-6 py-4 font-medium">Customer</th>
                      <th className="px-6 py-4 font-medium">Item Description</th>
                      <th className="px-6 py-4 font-medium text-right">Qty</th>
                      <th className="px-6 py-4 font-medium text-right">Unit Price</th>
                      <th className="px-6 py-4 font-medium text-right">Taxable Amount</th>
                      <th className="px-6 py-4 font-medium">Tax Code</th>
                      <th className="px-6 py-4 font-medium text-right">Tax Rate</th>
                      <th className="px-6 py-4 font-medium text-right">Tax Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 text-white/90">{formatDate(row.date)}</td>
                        <td className={`px-6 py-5 font-medium ${row.transactionType === "CN" ? "text-red-200" : "text-white"}`}>
                          {row.docNo}
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={
                              row.transactionType === "CN"
                                ? "inline-flex min-w-[88px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300"
                                : "inline-flex min-w-[88px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/80"
                            }
                          >
                            {row.transactionType}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-white/70">{row.referenceInvoiceNo}</td>
                        <td className="px-6 py-5 text-white/90">{row.customerName}</td>
                        <td className="px-6 py-5 text-white/90">{row.itemDescription}</td>
                        <td className="px-6 py-5 text-right text-white/90">{row.qty}</td>
                        <td className="px-6 py-5 text-right text-white/90">{formatCurrency(row.unitPrice)}</td>
                        <td className={`px-6 py-5 text-right font-medium ${row.taxableAmount < 0 ? "text-red-200" : "text-white"}`}>
                          {formatCurrency(row.taxableAmount)}
                        </td>
                        <td className="px-6 py-5 text-white/90">{row.taxCode}</td>
                        <td className="px-6 py-5 text-right text-white/90">{row.taxRate.toFixed(2)}%</td>
                        <td className={`px-6 py-5 text-right font-semibold ${row.taxAmount < 0 ? "text-red-200" : "text-amber-200"}`}>
                          {formatCurrency(row.taxAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
