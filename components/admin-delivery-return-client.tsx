"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AgentOption = { id: string; code: string; name: string; isActive: boolean };
type ProjectOption = { id: string; code: string; name: string; isActive: boolean };
type DepartmentOption = { id: string; code: string; name: string; projectId: string; isActive: boolean };

type SourceDeliveryLine = {
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
  returnedQty?: string | number | null;
  remainingReturnQty?: string | number | null;
  batchNo?: string | null;
  serialNos?: string[] | null;
  batchTracking?: boolean | null;
  serialNumberTracking?: boolean | null;
};

type SourceDeliveryOrder = {
  id: string;
  docNo: string;
  docDate: string;
  customerId: string;
  customerName: string;
  customerAccountNo?: string | null;
  email?: string | null;
  contactNo?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryAddressLine3?: string | null;
  deliveryAddressLine4?: string | null;
  deliveryCity?: string | null;
  deliveryPostCode?: string | null;
  deliveryCountryCode?: string | null;
  attention?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  currency?: string | null;
  grandTotal: string | number;
  lines?: SourceDeliveryLine[];
};

type DeliveryReturnRecord = {
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
  targetLinks?: Array<{ sourceTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
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
  deliveredQty: number;
  returnedQty: number;
  remainingReturnQty: number;
  unitPrice: number;
  discountRate: number;
  discountType: string;
  locationId: string;
  taxCodeId: string;
  batchNo: string;
  serialNos: string[];
  returnQty: string;
  remarks: string;
};

type SearchableSelectOption = { id: string; label: string; searchText: string };

type Props = {
  initialAgents: AgentOption[];
  initialProjects: ProjectOption[];
  initialDepartments: DepartmentOption[];
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
  if (status === "COMPLETED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateLine(line: PickLine) {
  const qty = Math.max(0, Number(line.returnQty || 0));
  const subtotal = roundMoney(qty * Math.max(0, Number(line.unitPrice || 0)));
  const discountRate = Math.max(0, Number(line.discountRate || 0));
  const discountAmount = line.discountType === "AMOUNT" ? 0 : roundMoney(subtotal * (discountRate / 100));
  return { subtotal, discountAmount, lineTotal: roundMoney(subtotal - discountAmount) };
}

function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: SearchableSelectOption[];
  value: string;
  disabled?: boolean;
  onChange: (option: SearchableSelectOption | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((item) => item.id === value) || null, [options, value]);

  useEffect(() => setSearch(selectedOption?.label || ""), [selectedOption?.label]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((item) => item.searchText.includes(keyword));
  }, [options, search]);

  return (
    <div ref={containerRef} className="relative">
      <label className="label-rk">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
          setSearch("");
        }}
        className={`input-rk flex items-center justify-between gap-3 pr-20 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="shrink-0 pr-5 text-white/60">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
          <div className="border-b border-white/10 p-3">
            <input autoFocus className="input-rk" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} />
          </div>
          <div className="max-h-56 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-sm text-white/45">No matching {label.toLowerCase()} found.</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setSearch(option.label);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                    selectedOption?.id === option.id ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminDeliveryReturnClient({ initialAgents, initialProjects, initialDepartments }: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<DeliveryReturnRecord[]>([]);
  const [sourceDeliveryOrders, setSourceDeliveryOrders] = useState<SourceDeliveryOrder[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [docDate, setDocDate] = useState(todayInput());
  const [systemDocNo, setSystemDocNo] = useState("");
  const [manualDocNo, setManualDocNo] = useState("");
  const [isDocNoOverride, setIsDocNoOverride] = useState(false);
  const [docDesc, setDocDesc] = useState("");
  const [remarks, setRemarks] = useState("");
  const [footerRemarks, setFooterRemarks] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [pickLines, setPickLines] = useState<PickLine[]>([]);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadDeliveryReturns() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/sales/delivery-return", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to load delivery returns.");
      setTransactions(payload.transactions || []);
      setSourceDeliveryOrders(payload.sourceDeliveryOrders || []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to load delivery returns." });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadNextDocNo(nextDate = docDate) {
    try {
      const response = await fetch(`/api/admin/sales/delivery-return?nextDocNo=1&docDate=${encodeURIComponent(nextDate)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) setSystemDocNo(payload.docNo || "");
    } catch {}
  }

  useEffect(() => {
    loadDeliveryReturns();
  }, []);

  const sourceOptions = useMemo<SearchableSelectOption[]>(() => {
    return sourceDeliveryOrders.map((item) => ({
      id: item.id,
      label: `${item.docNo} — ${item.customerName}${item.customerAccountNo ? ` (${item.customerAccountNo})` : ""}`,
      searchText: `${item.docNo} ${item.customerName} ${item.customerAccountNo || ""}`.toLowerCase(),
    }));
  }, [sourceDeliveryOrders]);

  const selectedSource = useMemo(() => sourceDeliveryOrders.find((item) => item.id === selectedSourceId) || null, [sourceDeliveryOrders, selectedSourceId]);

  const filteredTransactions = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return transactions.filter((item) => {
      const matchesKeyword = !keyword || `${item.docNo} ${item.customerName} ${item.customerAccountNo || ""} ${item.reference || ""}`.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [transactions, searchKeyword, statusFilter]);

  const totals = useMemo(() => {
    return pickLines.reduce(
      (sum, line) => {
        const result = calculateLine(line);
        return {
          subtotal: sum.subtotal + result.subtotal,
          discountTotal: sum.discountTotal + result.discountAmount,
          grandTotal: sum.grandTotal + result.lineTotal,
        };
      },
      { subtotal: 0, discountTotal: 0, grandTotal: 0 }
    );
  }, [pickLines]);

  function resetForm() {
    setDocDate(todayInput());
    setSystemDocNo("");
    setManualDocNo("");
    setIsDocNoOverride(false);
    setDocDesc("");
    setRemarks("");
    setFooterRemarks("");
    setSelectedSourceId("");
    setPickLines([]);
    setActiveTab("HEADER");
    setMessage(null);
  }

  function openCreateForm() {
    resetForm();
    setIsFormOpen(true);
    loadNextDocNo(todayInput());
  }

  function selectSource(option: SearchableSelectOption | null) {
    const source = option ? sourceDeliveryOrders.find((item) => item.id === option.id) : null;
    setSelectedSourceId(option?.id || "");
    if (!source) {
      setPickLines([]);
      return;
    }

    setDocDesc(`Delivery Return from ${source.docNo}`);
    setRemarks("");
    setFooterRemarks(source.docNo ? `Returned from Delivery Order ${source.docNo}` : "");

    const nextLines = (source.lines || [])
      .filter((line) => Number(line.remainingReturnQty || 0) > 0)
      .map((line) => ({
        key: `${source.id}-${line.id}`,
        sourceLineId: line.id,
        sourceTransactionId: source.id,
        sourceDocNo: source.docNo,
        inventoryProductId: line.inventoryProductId || "",
        productCode: line.productCode,
        productDescription: line.productDescription,
        itemType: line.itemType || "STOCK_ITEM",
        uom: line.uom,
        deliveredQty: Number(line.qty || 0),
        returnedQty: Number(line.returnedQty || 0),
        remainingReturnQty: Number(line.remainingReturnQty || 0),
        unitPrice: Number(line.unitPrice || 0),
        discountRate: Number(line.discountRate || 0),
        discountType: line.discountType || "PERCENT",
        locationId: line.locationId || "",
        taxCodeId: line.taxCodeId || "",
        batchNo: line.batchNo || "",
        serialNos: Array.isArray(line.serialNos) ? line.serialNos : [],
        returnQty: "",
        remarks: "",
      }));
    setPickLines(nextLines);
    setActiveTab("BODY");
  }

  function updatePickLine(key: string, patch: Partial<PickLine>) {
    setPickLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submitDeliveryReturn() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const lines = pickLines
        .map((line) => ({ ...line, qty: Number(line.returnQty || 0) }))
        .filter((line) => line.qty > 0);

      if (!selectedSourceId) throw new Error("Please select a Delivery Order.");
      if (lines.length === 0) throw new Error("Please enter at least one return qty.");

      for (const line of lines) {
        if (line.qty > line.remainingReturnQty) {
          throw new Error(`${line.productCode} return qty cannot exceed remaining returnable qty.`);
        }
      }

      const response = await fetch("/api/admin/sales/delivery-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docDate,
          docNo: isDocNoOverride ? manualDocNo : undefined,
          docDesc,
          sourceTransactionId: selectedSourceId,
          remarks,
          footerRemarks,
          lines,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to create delivery return.");

      setMessage({ type: "success", text: `Delivery Return ${payload.transaction?.docNo || ""} created successfully.` });
      setIsFormOpen(false);
      resetForm();
      await loadDeliveryReturns();
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to create delivery return." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Delivery Return</h1>
          <p className="mt-2 text-white/60">Create stock returns against Delivery Orders.</p>
        </div>
        <button type="button" onClick={openCreateForm} className="btn-rk">
          Create Delivery Return
        </button>
      </div>

      {message ? (
        <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-red-500/30 bg-red-500/10 text-red-100"}`}>
          {message.text}
        </div>
      ) : null}

      <div className="card-rk p-5">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search delivery return..." />
          <select className="input-rk" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Source DO</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/50">Loading delivery returns...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/50">No delivery return found.</td></tr>
              ) : (
                filteredTransactions.map((item) => (
                  <tr key={item.id} onClick={() => router.push(`/admin/sales/delivery-return/${item.id}`)} className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]">
                    <td className="px-4 py-4 font-semibold text-white">{item.docNo}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">{item.customerName}</div>
                      <div className="text-xs text-white/45">{item.customerAccountNo || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-white/65">{(item.targetLinks || []).map((link) => link.sourceTransaction?.docNo).filter(Boolean).join(", ") || "-"}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-4 text-right">{`${item.currency || "MYR"} ${money(item.grandTotal)}`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.3em] text-white/35">Sales</div>
                <h2 className="mt-3 text-3xl font-bold">Create Delivery Return</h2>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10">Close</button>
            </div>

            <div className="mb-6 flex gap-2">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition ${activeTab === tab ? "border-red-500/40 bg-red-500/15 text-red-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"}`}
                >
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {activeTab === "HEADER" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label-rk">Document Date</label>
                  <input className="input-rk" type="date" value={docDate} onChange={(e) => { setDocDate(e.target.value); loadNextDocNo(e.target.value); }} />
                </div>
                <div>
                  <label className="label-rk">System Doc No</label>
                  <div className="flex gap-2">
                    <input className="input-rk" value={isDocNoOverride ? manualDocNo : systemDocNo} onChange={(e) => setManualDocNo(normalizeDocNoInput(e.target.value))} readOnly={!isDocNoOverride} />
                    <button type="button" className="rounded-2xl border border-white/10 px-4 text-sm text-white/70 hover:bg-white/10" onClick={() => { setIsDocNoOverride((prev) => !prev); setManualDocNo(""); }}>
                      {isDocNoOverride ? "Auto" : "Override"}
                    </button>
                  </div>
                </div>
                <SearchableSelect label="Delivery Order" placeholder="Search or select delivery order" options={sourceOptions} value={selectedSourceId} onChange={selectSource} />
                <div>
                  <label className="label-rk">Description</label>
                  <input className="input-rk" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} />
                </div>
                <div>
                  <label className="label-rk">Customer</label>
                  <input className="input-rk" value={selectedSource?.customerName || ""} readOnly disabled />
                </div>
                <div>
                  <label className="label-rk">Customer A/C No</label>
                  <input className="input-rk" value={selectedSource?.customerAccountNo || ""} readOnly disabled />
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="space-y-4">
                {!selectedSource ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-white/55">Select a Delivery Order in Header first.</div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-white/45">
                        <tr>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3 text-right">DO Qty</th>
                          <th className="px-4 py-3 text-right">Returned</th>
                          <th className="px-4 py-3 text-right">Return Qty</th>
                          <th className="px-4 py-3">Batch / Serial</th>
                          <th className="px-4 py-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {pickLines.map((line) => (
                          <tr key={line.key} className="text-white/80">
                            <td className="px-4 py-4">
                              <div className="font-semibold text-white">{line.productCode}</div>
                              <div className="text-xs text-white/50">{line.productDescription}</div>
                            </td>
                            <td className="px-4 py-4 text-right">{money(line.deliveredQty)}</td>
                            <td className="px-4 py-4 text-right">{money(line.returnedQty)}</td>
                            <td className="px-4 py-4 text-right">
                              <input
                                className="input-rk w-28 text-right"
                                value={line.returnQty}
                                onChange={(e) => updatePickLine(line.key, { returnQty: e.target.value })}
                                placeholder={`Max ${line.remainingReturnQty}`}
                              />
                            </td>
                            <td className="px-4 py-4 text-xs text-white/55">
                              {line.batchNo ? <div>Batch No: {line.batchNo}</div> : null}
                              {line.serialNos.length > 0 ? <div className="mt-1">S/N No: {line.serialNos.join(", ")}</div> : null}
                              {!line.batchNo && line.serialNos.length === 0 ? "-" : null}
                            </td>
                            <td className="px-4 py-4">
                              <input className="input-rk" value={line.remarks} onChange={(e) => updatePickLine(line.key, { remarks: e.target.value })} placeholder="Return reason / note" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label-rk">Remarks</label>
                  <textarea className="input-rk min-h-[120px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason / return note" />
                </div>
                <div>
                  <label className="label-rk">Footer Remarks</label>
                  <textarea className="input-rk min-h-[120px]" value={footerRemarks} onChange={(e) => setFooterRemarks(e.target.value)} />
                </div>
                <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex justify-between text-white/70"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
                  <div className="mt-2 flex justify-between text-white/70"><span>Discount</span><span>{money(totals.discountTotal)}</span></div>
                  <div className="mt-3 flex justify-between text-xl font-bold text-white"><span>Total Return Value</span><span>{money(totals.grandTotal)}</span></div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-white/70 hover:bg-white/10">Cancel</button>
              <button type="button" disabled={isSubmitting} onClick={submitDeliveryReturn} className="btn-rk disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving..." : "Save Delivery Return"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
