"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TaxCodeOption = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: string;
};

type InvoiceLine = {
  id: string;
  inventoryProductId?: string | null;
  productCode: string;
  productDescription: string;
  itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | string | null;
  uom: string;
  qty: string | number;
  unitPrice: string | number;
  discountRate?: string | number | null;
  discountType?: string | null;
  locationId?: string | null;
  taxCodeId?: string | null;
  remarks?: string | null;
  creditedQty?: string | number | null;
  creditedAmount?: string | number | null;
  remainingCreditQty?: string | number | null;
  remainingCreditAmount?: string | number | null;
};

type SourceInvoice = {
  id: string;
  docNo: string;
  docDate: string;
  customerId: string;
  customerName: string;
  customerAccountNo?: string | null;
  currency?: string | null;
  grandTotal: string | number;
  lines?: InvoiceLine[];
};

type CreditNoteRecord = {
  id: string;
  docNo: string;
  docDate: string;
  docDesc?: string | null;
  customerName: string;
  customerAccountNo?: string | null;
  currency?: string | null;
  reference?: string | null;
  remarks?: string | null;
  status: "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED";
  subtotal: string | number;
  discountTotal: string | number;
  taxTotal: string | number;
  grandTotal: string | number;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  lines?: Array<{
    id: string;
    productCode: string;
    productDescription: string;
    uom: string;
    qty: string | number;
    unitPrice: string | number;
    lineTotal: string | number;
  }>;
  sourceLinks?: Array<{ sourceTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
};

type PickLine = {
  key: string;
  sourceLineId: string;
  sourceTransactionId: string;
  sourceDocNo: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  itemType: string;
  uom: string;
  invoicedQty: number;
  creditedQty: number;
  remainingCreditQty: number;
  invoicedAmount: number;
  creditedAmount: number;
  remainingCreditAmount: number;
  unitPrice: number;
  discountRate: number;
  discountType: string;
  locationId: string;
  taxCodeId: string;
  creditQty: string;
  creditAmount: string;
  remarks: string;
};

type Props = {
  initialTaxCodes: TaxCodeOption[];
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
}

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "COMPLETED") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateLine(line: PickLine) {
  const qty = Math.max(0, Number(line.creditQty || 0));
  const unitPrice = Math.max(0, Number(line.unitPrice || 0));
  const subtotal = roundMoney(qty * unitPrice);
  const discountRate = Math.max(0, Number(line.discountRate || 0));
  const discountAmount = line.discountType === "AMOUNT" ? 0 : roundMoney(subtotal * (discountRate / 100));
  const lineTotal = line.itemType === "SERVICE_ITEM" && Number(line.creditAmount || 0) > 0
    ? roundMoney(Number(line.creditAmount || 0))
    : roundMoney(subtotal - discountAmount);
  return { subtotal, discountAmount, lineTotal };
}

function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}

export function AdminCreditNoteClient({ initialTaxCodes }: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<CreditNoteRecord[]>([]);
  const [sourceInvoices, setSourceInvoices] = useState<SourceInvoice[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [pickLines, setPickLines] = useState<PickLine[]>([]);
  const [docDate, setDocDate] = useState(todayInput());
  const [docNo, setDocNo] = useState("");
  const [docNoPreview, setDocNoPreview] = useState("Auto Generated");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CreditNoteRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const selectedInvoice = useMemo(() => sourceInvoices.find((item) => item.id === selectedInvoiceId) || null, [sourceInvoices, selectedInvoiceId]);
  const selectedCustomer = useMemo(() => customerOptions.find((item) => item.id === selectedCustomerId) || null, [customerOptions, selectedCustomerId]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; searchText: string }>();
    for (const invoice of sourceInvoices) {
      if (!invoice.customerId) continue;
      if (map.has(invoice.customerId)) continue;
      const accountNo = invoice.customerAccountNo || "-";
      map.set(invoice.customerId, {
        id: invoice.customerId,
        label: `${accountNo} — ${invoice.customerName}`,
        searchText: `${accountNo} ${invoice.customerName}`.toLowerCase(),
      });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [sourceInvoices]);

  const filteredInvoices = useMemo(() => {
    if (!selectedCustomerId) return [];
    const keyword = sourceSearch.trim().toLowerCase();
    const customerInvoices = sourceInvoices.filter((invoice) => invoice.customerId === selectedCustomerId);
    if (!keyword) return customerInvoices;
    return customerInvoices.filter((invoice) =>
      `${invoice.docNo} ${invoice.customerName} ${invoice.customerAccountNo || ""}`.toLowerCase().includes(keyword)
    );
  }, [selectedCustomerId, sourceInvoices, sourceSearch]);

  const totals = useMemo(() => {
    const calculated = pickLines
      .filter((line) => Number(line.creditQty || 0) > 0 || Number(line.creditAmount || 0) > 0)
      .map((line) => calculateLine(line));
    const subtotal = roundMoney(calculated.reduce((sum, line) => sum + line.subtotal, 0));
    const discount = roundMoney(calculated.reduce((sum, line) => sum + line.discountAmount, 0));
    const grandTotal = roundMoney(calculated.reduce((sum, line) => sum + line.lineTotal, 0));
    return { subtotal, discount, tax: 0, grandTotal };
  }, [pickLines]);

  async function loadTransactions() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set("q", searchKeyword.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/sales/credit-note?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setTransactions(response.ok && data.ok && Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSourceInvoices() {
    const response = await fetch("/api/admin/sales/credit-note?sourceInvoices=1", { cache: "no-store" });
    const data = await response.json();
    setSourceInvoices(response.ok && data.ok && Array.isArray(data.invoices) ? data.invoices : []);
  }

  async function loadNextDocNo(nextDocDate = docDate) {
    try {
      const response = await fetch(`/api/admin/sales/credit-note?nextDocNo=1&docDate=${encodeURIComponent(nextDocDate)}`, { cache: "no-store" });
      const data = await response.json();
      setDocNoPreview(response.ok && data.ok && data.docNo ? data.docNo : "Auto Generated");
    } catch {
      setDocNoPreview("Auto Generated");
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    if (isCreateOpen && !docNo) void loadNextDocNo(docDate);
  }, [docDate, isCreateOpen, docNo]);

  async function openCreate() {
    setDocDate(todayInput());
    setDocNo("");
    setDocNoPreview("Auto Generated");
    setReason("");
    setSelectedCustomerId("");
    setSelectedInvoiceId("");
    setPickLines([]);
    setSourceSearch("");
    setSubmitError("");
    setSubmitSuccess("");
    setActiveTab("HEADER");
    setIsCreateOpen(true);
    await Promise.all([loadSourceInvoices(), loadNextDocNo(todayInput())]);
  }

  function closeCreate() {
    setIsCreateOpen(false);
    setSelectedCustomerId("");
    setSelectedInvoiceId("");
    setPickLines([]);
    setReason("");
    setSubmitError("");
  }

  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedInvoiceId("");
    setPickLines([]);
    setSourceSearch("");
  }

  function preparePickLines(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    const invoice = sourceInvoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      setPickLines([]);
      return;
    }

    setPickLines(
      (invoice.lines || [])
        .filter((line) => {
          const itemType = line.itemType === "SERVICE_ITEM" ? "SERVICE_ITEM" : "STOCK_ITEM";
          return itemType === "SERVICE_ITEM"
            ? Number(line.remainingCreditAmount || 0) > 0
            : Number(line.remainingCreditQty || 0) > 0;
        })
        .map((line) => {
          const itemType = line.itemType === "SERVICE_ITEM" ? "SERVICE_ITEM" : "STOCK_ITEM";
          const remainingQty = Number(line.remainingCreditQty || 0);
          const remainingAmount = Number(line.remainingCreditAmount || 0);
          return {
            key: `${invoice.id}-${line.id}`,
            sourceLineId: line.id,
            sourceTransactionId: invoice.id,
            sourceDocNo: invoice.docNo,
            inventoryProductId: line.inventoryProductId || "",
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType,
            uom: line.uom || "",
            invoicedQty: Number(line.qty || 0),
            creditedQty: Number(line.creditedQty || 0),
            remainingCreditQty: remainingQty,
            invoicedAmount: Number(line.unitPrice || 0) * Number(line.qty || 0),
            creditedAmount: Number(line.creditedAmount || 0),
            remainingCreditAmount: remainingAmount,
            unitPrice: Number(line.unitPrice || 0),
            discountRate: Number(line.discountRate || 0),
            discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
            locationId: line.locationId || "",
            taxCodeId: line.taxCodeId || "",
            creditQty: itemType === "SERVICE_ITEM" ? "1" : String(remainingQty),
            creditAmount: itemType === "SERVICE_ITEM" ? money(remainingAmount).replace(/,/g, "") : "0",
            remarks: line.remarks || "",
          };
        })
    );
  }

  function updatePickLine(key: string, patch: Partial<PickLine>) {
    setPickLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submitCreditNote() {
    if (!selectedCustomerId) {
      setSubmitError("Customer is required.");
      return;
    }
    if (!selectedInvoice) {
      setSubmitError("Please select Sales Invoice.");
      return;
    }
    if (!reason.trim()) {
      setSubmitError("Credit Note reason is required.");
      return;
    }

    const selectedLines = pickLines.filter((line) =>
      line.itemType === "SERVICE_ITEM" ? Number(line.creditAmount || 0) > 0 : Number(line.creditQty || 0) > 0
    );

    if (selectedLines.length === 0) {
      setSubmitError("Please credit at least one line.");
      return;
    }

    const overLine = selectedLines.find((line) =>
      line.itemType === "SERVICE_ITEM"
        ? Number(line.creditAmount || 0) > line.remainingCreditAmount
        : Number(line.creditQty || 0) > line.remainingCreditQty
    );

    if (overLine) {
      setSubmitError(
        overLine.itemType === "SERVICE_ITEM"
          ? `${overLine.productCode} credit amount cannot exceed remaining creditable amount.`
          : `${overLine.productCode} credit qty cannot exceed remaining creditable qty.`
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/admin/sales/credit-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docDate,
          docNo: docNo.trim() || undefined,
          sourceTransactionId: selectedInvoice.id,
          reason,
          remarks: reason,
          lines: selectedLines.map((line) => ({
            sourceLineId: line.sourceLineId,
            sourceTransactionId: line.sourceTransactionId,
            inventoryProductId: line.inventoryProductId,
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType: line.itemType,
            uom: line.uom,
            qty: line.itemType === "SERVICE_ITEM" ? "1" : line.creditQty,
            claimAmount: line.itemType === "SERVICE_ITEM" ? line.creditAmount : undefined,
            unitPrice: line.unitPrice,
            discountRate: line.discountRate,
            discountType: line.discountType,
            locationId: line.locationId,
            taxCodeId: line.taxCodeId,
            remarks: line.remarks,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create credit note.");

      closeCreate();
      setSubmitSuccess(`Credit Note ${data.transaction?.docNo || ""} created successfully.`);
      await Promise.all([loadTransactions(), loadSourceInvoices()]);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create credit note.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelCreditNote() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setSubmitError("Cancel reason is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/sales/credit-note/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", cancelReason }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to cancel credit note.");

      setCancelTarget(null);
      setCancelReason("");
      setSubmitSuccess(`Credit Note ${cancelTarget.docNo} cancelled successfully.`);
      await Promise.all([loadTransactions(), loadSourceInvoices()]);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to cancel credit note.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">Credit Note</h1>
          <p className="mt-4 max-w-3xl text-white/70">Create and manage credit note documents against sales invoices.</p>
        </div>
      </div>

      {submitSuccess && !isCreateOpen ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {submitSuccess}
        </div>
      ) : null}
      {submitError && !isCreateOpen ? <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{submitError}</div> : null}

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Credit Note</p>
            <h2 className="mt-4 text-2xl font-bold">Existing Credit Note Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">Use Credit Note to reduce sales amount and stock returned items back into inventory.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
            Create Credit Note
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search credit note no / customer" />
            <select className="input-rk" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Status</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Source INV</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading credit notes...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No credit note found.</td></tr>
              ) : (
                transactions.map((transaction) => {
                  const sourceInv = transaction.sourceLinks?.[0]?.sourceTransaction?.docNo || transaction.reference || "-";
                  return (
                    <tr key={transaction.id} className="text-white/85">
                      <td className="px-4 py-5 font-semibold text-white">
                        <a className="hover:text-rk-red" href={`/admin/sales/credit-note/${transaction.id}`}>{transaction.docNo}</a>
                        <div className="mt-1 text-xs font-normal text-white/45">{formatDate(transaction.docDate)}</div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="font-semibold">{transaction.customerName}</div>
                        <div className="mt-1 text-xs text-white/45">{transaction.customerAccountNo || "-"}</div>
                      </td>
                      <td className="px-4 py-5 text-white/70">{sourceInv}</td>
                      <td className="px-4 py-5">
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(transaction.status)}`}>{transaction.status}</span>
                      </td>
                      <td className="px-4 py-5 text-right font-semibold">{transaction.currency || "MYR"} {money(transaction.grandTotal)}</td>
                      <td className="px-4 py-5 text-right">
                        {transaction.status !== "CANCELLED" ? (
                          <button type="button" onClick={() => setCancelTarget(transaction)} className="rounded-xl border border-red-500/40 px-4 py-2 text-xs text-red-100 transition hover:bg-red-500/10">
                            Cancel
                          </button>
                        ) : <span className="text-xs text-white/35">-</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-5 shadow-2xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Credit Note</p>
                <h2 className="mt-4 text-3xl font-bold text-white">Create Credit Note</h2>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl border px-5 py-3 text-sm font-bold transition ${
                    activeTab === tab
                      ? "border-red-500 bg-red-500 text-white"
                      : "border-white/10 bg-black/20 text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}
                </button>
              ))}
            </div>

            <div className="mt-6 border-t border-white/10" />

            {submitError ? <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{submitError}</div> : null}

            {activeTab === "HEADER" ? (
              <div className="mt-8 space-y-6">
                <div className="grid gap-5 md:grid-cols-[280px_1fr]">
                  <div>
                    <label className="label-rk">Doc Date</label>
                    <input type="date" className="input-rk" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label-rk">System Doc No</label>
                    <input className="input-rk" value={docNo || docNoPreview} readOnly disabled />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-4">
                  <div>
                    <label className="label-rk">A/C No</label>
                    <select className="input-rk" value={selectedCustomerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                      <option value="">Search or select customer</option>
                      {customerOptions.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-rk">Customer Name</label>
                    <input className="input-rk" value={selectedCustomer?.label?.split(" — ").slice(1).join(" — ") || ""} readOnly disabled />
                  </div>
                  <div>
                    <label className="label-rk">Email</label>
                    <input className="input-rk" value="" readOnly disabled />
                  </div>
                  <div>
                    <label className="label-rk">Contact No</label>
                    <input className="input-rk" value="" readOnly disabled />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="label-rk">Document Description</label>
                    <input className="input-rk" value={selectedInvoice ? `Credit Note for ${selectedInvoice.docNo}` : ""} readOnly disabled />
                  </div>
                  <div>
                    <label className="label-rk">Reason <span className="text-rk-red">*</span></label>
                    <input className="input-rk" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer cancelled item / goods returned" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="label-rk">Manual CN No (Optional)</label>
                    <input className="input-rk" value={docNo} onChange={(e) => setDocNo(normalizeDocNoInput(e.target.value))} placeholder={docNoPreview} />
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Billing Address</p>
                  <p className="mt-4 text-sm leading-6 text-white/60">Billing address will follow the selected source Sales Invoice.</p>
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="mt-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Generate From</p>
                    <h3 className="mt-3 text-xl font-bold text-white">Sales Invoice</h3>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label-rk">A/C No</label>
                      <select className="input-rk" value={selectedCustomerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                        <option value="">Search or select customer</option>
                        {customerOptions.map((customer) => (
                          <option key={customer.id} value={customer.id}>{customer.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-rk">Search Sales Invoice</label>
                      <input
                        className="input-rk"
                        value={sourceSearch}
                        onChange={(e) => setSourceSearch(e.target.value)}
                        disabled={!selectedCustomerId}
                        placeholder="Search sales invoice no / customer"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10">
                    {!selectedCustomerId ? (
                      <div className="px-4 py-6 text-sm text-white/45">Please select customer first.</div>
                    ) : filteredInvoices.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-white/45">No available sales invoice found for this customer.</div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        {filteredInvoices.map((invoice) => (
                          <button
                            key={invoice.id}
                            type="button"
                            onClick={() => preparePickLines(invoice.id)}
                            className={`flex w-full items-center justify-between gap-4 border-b border-white/10 px-4 py-4 text-left text-sm transition last:border-0 ${
                              selectedInvoiceId === invoice.id ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"
                            }`}
                          >
                            <div>
                              <div className="font-semibold">{invoice.docNo}</div>
                              <div className="mt-1 text-xs text-white/45">{invoice.customerName} • {formatDate(invoice.docDate)}</div>
                            </div>
                            <div className="text-right font-semibold">{invoice.currency || "MYR"} {money(invoice.grandTotal)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {selectedInvoice ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                        <tr>
                          <th className="px-4 py-4">INV</th>
                          <th className="px-4 py-4">Product</th>
                          <th className="px-4 py-4 text-right">Invoiced</th>
                          <th className="px-4 py-4 text-right">Credited</th>
                          <th className="px-4 py-4 text-right">Remaining</th>
                          <th className="px-4 py-4 text-right">Credit Qty / Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {pickLines.map((line) => (
                          <tr key={line.key}>
                            <td className="px-4 py-4 text-white/70">{line.sourceDocNo}</td>
                            <td className="px-4 py-4">
                              <div className="font-semibold text-white">{line.productCode}</div>
                              <div className="mt-1 text-xs text-white/45">{line.productDescription}</div>
                            </td>
                            <td className="px-4 py-4 text-right text-white/75">
                              {line.itemType === "SERVICE_ITEM" ? money(line.invoicedAmount) : `${money(line.invoicedQty)} ${line.uom}`}
                            </td>
                            <td className="px-4 py-4 text-right text-white/75">
                              {line.itemType === "SERVICE_ITEM" ? money(line.creditedAmount) : `${money(line.creditedQty)} ${line.uom}`}
                            </td>
                            <td className="px-4 py-4 text-right text-white/75">
                              {line.itemType === "SERVICE_ITEM" ? money(line.remainingCreditAmount) : `${money(line.remainingCreditQty)} ${line.uom}`}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <input
                                className="input-rk text-right"
                                value={line.itemType === "SERVICE_ITEM" ? line.creditAmount : line.creditQty}
                                onChange={(e) =>
                                  updatePickLine(line.key, line.itemType === "SERVICE_ITEM" ? { creditAmount: e.target.value } : { creditQty: e.target.value })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="mt-8 grid gap-4 md:grid-cols-[1fr_360px]">
                <div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/55">
                  Credit Note is posted immediately. Stock items will be stocked-in. Cancelling the CN will reverse the stock movement.
                </div>
                <div className="rounded-2xl border border-white/10 p-5">
                  <div className="flex justify-between text-white/70"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
                  <div className="mt-3 flex justify-between text-white/70"><span>Discount</span><span>{money(totals.discount)}</span></div>
                  <div className="mt-3 flex justify-between text-white/70"><span>Tax</span><span>{money(totals.tax)}</span></div>
                  <div className="mt-5 flex justify-between border-t border-white/10 pt-5 text-xl font-bold text-white"><span>Grand Total</span><span>{money(totals.grandTotal)}</span></div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={closeCreate} className="rounded-xl border border-white/15 px-6 py-3 text-sm text-white/75 hover:bg-white/10">Close</button>
              <button type="button" disabled={isSubmitting} onClick={submitCreditNote} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-400 disabled:opacity-60">
                {isSubmitting ? "Creating..." : "Create Credit Note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Cancel Credit Note</h3>
            <p className="mt-3 text-sm text-white/65">Cancelling this CN will stock-out the credited qty again and remove the sales reduction effect.</p>
            <div className="mt-5">
              <label className="label-rk">Cancel Reason <span className="text-rk-red">*</span></label>
              <textarea className="input-rk min-h-[110px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Enter reason" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 hover:bg-white/10">Close</button>
              <button type="button" disabled={isSubmitting} onClick={cancelCreditNote} className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-60">Cancel CN</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
