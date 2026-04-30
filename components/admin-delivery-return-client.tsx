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

function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "COMPLETED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [docDate, setDocDate] = useState(todayInput());
  const [docNoPreview, setDocNoPreview] = useState("");
  const [docNo, setDocNo] = useState("");
  const [docNoDraft, setDocNoDraft] = useState("");
  const [isDocNoModalOpen, setIsDocNoModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [reason, setReason] = useState("");
  const [footerRemarks, setFooterRemarks] = useState("");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [pickLines, setPickLines] = useState<PickLine[]>([]);
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DeliveryReturnRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  async function loadTransactions() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/sales/delivery-return", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to load delivery returns.");
      setTransactions(payload.transactions || []);
      setSourceDeliveryOrders(payload.sourceDeliveryOrders || []);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to load delivery returns.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadNextDocNo(nextDate = docDate) {
    try {
      const response = await fetch(`/api/admin/sales/delivery-return?nextDocNo=1&docDate=${encodeURIComponent(nextDate)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) setDocNoPreview(payload.docNo || "");
    } catch {}
  }

  useEffect(() => {
    loadTransactions();
  }, []);

  const customerOptions = useMemo<SearchableSelectOption[]>(() => {
    const map = new Map<string, SearchableSelectOption>();
    for (const item of sourceDeliveryOrders) {
      if (!item.customerId || map.has(item.customerId)) continue;
      map.set(item.customerId, {
        id: item.customerId,
        label: `${item.customerAccountNo || "-"} — ${item.customerName}`,
        searchText: `${item.customerAccountNo || ""} ${item.customerName} ${item.email || ""} ${item.contactNo || ""}`.toLowerCase(),
      });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [sourceDeliveryOrders]);

  const selectedCustomerSource = useMemo(() => sourceDeliveryOrders.find((item) => item.customerId === selectedCustomerId) || null, [sourceDeliveryOrders, selectedCustomerId]);
  const selectedSource = useMemo(() => sourceDeliveryOrders.find((item) => item.id === selectedSourceId) || null, [sourceDeliveryOrders, selectedSourceId]);

  const agentOptions = useMemo<SearchableSelectOption[]>(() => initialAgents.map((item) => ({ id: item.id, label: `${item.code} — ${item.name}`, searchText: `${item.code} ${item.name}`.toLowerCase() })), [initialAgents]);
  const projectOptions = useMemo<SearchableSelectOption[]>(() => initialProjects.map((item) => ({ id: item.id, label: `${item.code} — ${item.name}`, searchText: `${item.code} ${item.name}`.toLowerCase() })), [initialProjects]);
  const departmentOptions = useMemo<SearchableSelectOption[]>(() => initialDepartments.filter((item) => !projectId || item.projectId === projectId).map((item) => ({ id: item.id, label: `${item.code} — ${item.name}`, searchText: `${item.code} ${item.name}`.toLowerCase() })), [initialDepartments, projectId]);

  const filteredSourceDeliveryOrders = useMemo(() => {
    const keyword = sourceSearch.trim().toLowerCase();
    return sourceDeliveryOrders
      .filter((item) => item.customerId === selectedCustomerId)
      .filter((item) => !keyword || `${item.docNo} ${item.customerName} ${item.customerAccountNo || ""}`.toLowerCase().includes(keyword));
  }, [sourceDeliveryOrders, selectedCustomerId, sourceSearch]);

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
          discount: sum.discount + result.discountAmount,
          tax: 0,
          grandTotal: sum.grandTotal + result.lineTotal,
        };
      },
      { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 }
    );
  }, [pickLines]);

  function resetCreate() {
    setActiveTab("HEADER");
    setDocDate(todayInput());
    setDocNoPreview("");
    setDocNo("");
    setDocNoDraft("");
    setSelectedCustomerId("");
    setSelectedSourceId("");
    setIsSourcePickerOpen(false);
    setSourceSearch("");
    setReason("");
    setFooterRemarks("");
    setAgentId("");
    setProjectId("");
    setDepartmentId("");
    setPickLines([]);
    setSubmitError("");
  }

  function openCreate() {
    resetCreate();
    setIsCreateOpen(true);
    loadNextDocNo(todayInput());
  }

  function closeCreate() {
    setIsCreateOpen(false);
    resetCreate();
  }

  function openDocNoModal() {
    setDocNoDraft("");
    setIsDocNoModalOpen(true);
  }

  function applyDocNoOverride() {
    setDocNo(normalizeDocNoInput(docNoDraft));
    setIsDocNoModalOpen(false);
  }

  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedSourceId("");
    setPickLines([]);
    setSourceSearch("");
    setIsSourcePickerOpen(false);
    const firstSource = sourceDeliveryOrders.find((item) => item.customerId === customerId);
    setAgentId(firstSource?.agentId || "");
    setProjectId(firstSource?.projectId || "");
    setDepartmentId(firstSource?.departmentId || "");
  }

  function preparePickLines(sourceId: string) {
    const source = sourceDeliveryOrders.find((item) => item.id === sourceId);
    setSelectedSourceId(sourceId);
    setIsSourcePickerOpen(false);
    if (!source) {
      setPickLines([]);
      return;
    }

    setAgentId(source.agentId || "");
    setProjectId(source.projectId || "");
    setDepartmentId(source.departmentId || "");
    setFooterRemarks(`Returned from Delivery Order ${source.docNo}`);

    setPickLines(
      (source.lines || [])
        .filter((line) => line.itemType !== "SERVICE_ITEM" && Number(line.remainingReturnQty || 0) > 0)
        .map((line) => {
          const remainingQty = Number(line.remainingReturnQty || 0);
          return {
            key: `${source.id}-${line.id}`,
            sourceLineId: line.id,
            sourceTransactionId: source.id,
            sourceDocNo: source.docNo,
            inventoryProductId: line.inventoryProductId || "",
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType: line.itemType || "STOCK_ITEM",
            uom: line.uom || "",
            deliveredQty: Number(line.qty || 0),
            returnedQty: Number(line.returnedQty || 0),
            remainingReturnQty: remainingQty,
            unitPrice: Number(line.unitPrice || 0),
            discountRate: Number(line.discountRate || 0),
            discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
            locationId: line.locationId || "",
            taxCodeId: line.taxCodeId || "",
            batchNo: line.batchNo || "",
            serialNos: Array.isArray(line.serialNos) ? line.serialNos : [],
            returnQty: String(remainingQty),
            remarks: line.remarks || "",
          };
        })
    );
  }

  function sanitizeReturnInput(value: string, maxValue: number) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric < 0) return "0";
    return String(Math.min(numeric, maxValue));
  }

  function updatePickLine(key: string, patch: Partial<PickLine>) {
    setPickLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submitDeliveryReturn() {
    if (!selectedCustomerId) {
      setSubmitError("Customer is required.");
      return;
    }
    if (!selectedSource) {
      setSubmitError("Please select Delivery Order.");
      return;
    }
    if (!reason.trim()) {
      setSubmitError("Delivery Return reason is required.");
      return;
    }

    const selectedLines = pickLines.filter((line) => Number(line.returnQty || 0) > 0);
    if (selectedLines.length === 0) {
      setSubmitError("Please return at least one line.");
      return;
    }

    const overLine = selectedLines.find((line) => Number(line.returnQty || 0) > line.remainingReturnQty);
    if (overLine) {
      setSubmitError(`${overLine.productCode} return qty cannot exceed remaining returnable qty.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/admin/sales/delivery-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docDate,
          docNo: docNo.trim() || undefined,
          docDesc: selectedSource ? `Delivery Return from ${selectedSource.docNo}` : "",
          sourceTransactionId: selectedSource.id,
          remarks: reason,
          footerRemarks,
          lines: selectedLines.map((line) => ({
            sourceLineId: line.sourceLineId,
            sourceTransactionId: line.sourceTransactionId,
            inventoryProductId: line.inventoryProductId,
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType: line.itemType,
            uom: line.uom,
            qty: line.returnQty,
            unitPrice: line.unitPrice,
            discountRate: line.discountRate,
            discountType: line.discountType,
            locationId: line.locationId,
            taxCodeId: line.taxCodeId,
            batchNo: line.batchNo,
            serialNos: line.serialNos,
            remarks: line.remarks,
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create delivery return.");

      closeCreate();
      setSubmitSuccess(`Delivery Return ${data.transaction?.docNo || ""} created successfully.`);
      await loadTransactions();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create delivery return.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelDeliveryReturn() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setSubmitError("Cancel reason is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/sales/delivery-return/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", cancelReason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to cancel delivery return.");

      setCancelTarget(null);
      setCancelReason("");
      setSubmitSuccess(`Delivery Return ${cancelTarget.docNo} cancelled successfully.`);
      await loadTransactions();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to cancel delivery return.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">Delivery Return</h1>
          <p className="mt-4 max-w-3xl text-white/70">Create and manage delivery return documents against delivery orders.</p>
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
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Delivery Return</p>
            <h2 className="mt-4 text-2xl font-bold">Existing Delivery Return Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">Use Delivery Return to stock-in goods returned from Delivery Orders.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
            Create Delivery Return
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search delivery return no / customer" />
            <div className="relative max-w-[366px]">
              <select className="input-rk w-full appearance-none pr-16" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-xs text-white/55">▾</span>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Source DO</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading delivery returns...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No delivery return found.</td></tr>
              ) : (
                filteredTransactions.map((transaction) => {
                  const sourceDo = transaction.targetLinks?.[0]?.sourceTransaction?.docNo || transaction.reference || "-";
                  return (
                    <tr key={transaction.id} onClick={() => router.push(`/admin/sales/delivery-return/${transaction.id}`)} className="cursor-pointer text-white/85 transition hover:bg-white/[0.03]">
                      <td className="px-4 py-5 font-semibold text-white">
                        <a className="hover:text-rk-red" href={`/admin/sales/delivery-return/${transaction.id}`}>{transaction.docNo}</a>
                        <div className="mt-1 text-xs font-normal text-white/45">{formatDate(transaction.docDate)}</div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="font-semibold">{transaction.customerName}</div>
                        <div className="mt-1 text-xs text-white/45">{transaction.customerAccountNo || "-"}</div>
                      </td>
                      <td className="px-4 py-5 text-white/70">{sourceDo}</td>
                      <td className="px-4 py-5">
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(transaction.status)}`}>{transaction.status}</span>
                      </td>
                      <td className="px-4 py-5 text-right font-semibold">{transaction.currency || "MYR"} {money(transaction.grandTotal)}</td>
                      <td className="px-4 py-5 text-right">
                        {transaction.status !== "CANCELLED" ? (
                          <button type="button" onClick={(event) => { event.stopPropagation(); setCancelTarget(transaction); }} className="rounded-xl border border-red-500/40 px-4 py-2 text-xs text-red-100 transition hover:bg-red-500/10">
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
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Delivery Return</p>
                <h2 className="mt-4 text-3xl font-bold text-white">Create Delivery Return</h2>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab
                      ? "bg-red-600 text-white"
                      : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}
                </button>
              ))}
            </div>

            {submitError ? <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{submitError}</div> : null}

            {activeTab === "HEADER" ? (
              <div className="mt-8 space-y-6">
                <div className="grid gap-5 md:grid-cols-[280px_1fr]">
                  <div>
                    <label className="label-rk">Doc Date</label>
                    <input type="date" className="input-rk" value={docDate} onChange={(e) => { setDocDate(e.target.value); loadNextDocNo(e.target.value); }} />
                  </div>
                  <div>
                    <label className="label-rk">System Doc No</label>
                    <button type="button" onClick={openDocNoModal} className="input-rk flex items-center justify-between gap-3 text-left">
                      <span>{docNo || docNoPreview}</span>
                      <span className="text-xs text-white/45">Click to override</span>
                    </button>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-4">
                  <SearchableSelect label="A/C No" placeholder="Search or select customer" options={customerOptions} value={selectedCustomerId} onChange={(option) => handleCustomerChange(option?.id || "")} />
                  <div>
                    <label className="label-rk">Customer Name</label>
                    <input className="input-rk" value={selectedCustomerSource?.customerName || ""} readOnly disabled />
                  </div>
                  <div>
                    <label className="label-rk">Email</label>
                    <input className="input-rk" value={selectedCustomerSource?.email || ""} readOnly disabled />
                  </div>
                  <div>
                    <label className="label-rk">Contact No</label>
                    <input className="input-rk" value={selectedCustomerSource?.contactNo || ""} readOnly disabled />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="label-rk">Document Description</label>
                    <input className="input-rk" value={selectedSource ? `Delivery Return from ${selectedSource.docNo}` : ""} readOnly disabled />
                  </div>
                  <div>
                    <label className="label-rk">Reason <span className="text-rk-red">*</span></label>
                    <input className="input-rk" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer returned goods / spoiled item" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-4">
                  <div>
                    <label className="label-rk">Attention</label>
                    <input className="input-rk" value={selectedSource?.attention || selectedCustomerSource?.attention || ""} readOnly disabled />
                  </div>
                  <SearchableSelect label="Agent" placeholder="No Agent" options={agentOptions} value={agentId} onChange={(option) => setAgentId(option?.id || "")} />
                  <SearchableSelect label="Project" placeholder="No Project" options={projectOptions} value={projectId} onChange={(option) => { setProjectId(option?.id || ""); setDepartmentId(""); }} />
                  <SearchableSelect label="Department" placeholder="No Department" options={departmentOptions} value={departmentId} onChange={(option) => setDepartmentId(option?.id || "")} disabled={!projectId && departmentOptions.length <= 1} />
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Delivery Address</p>
                  <p className="mt-4 text-sm leading-6 text-white/60">Delivery address will follow the selected source Delivery Order.</p>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div><label className="label-rk">Delivery Address Line 1</label><input className="input-rk" value={selectedSource?.deliveryAddressLine1 || selectedCustomerSource?.deliveryAddressLine1 || ""} readOnly disabled /></div>
                    <div><label className="label-rk">Delivery Address Line 2</label><input className="input-rk" value={selectedSource?.deliveryAddressLine2 || selectedCustomerSource?.deliveryAddressLine2 || ""} readOnly disabled /></div>
                    <div><label className="label-rk">Delivery Address Line 3</label><input className="input-rk" value={selectedSource?.deliveryAddressLine3 || selectedCustomerSource?.deliveryAddressLine3 || ""} readOnly disabled /></div>
                    <div><label className="label-rk">Delivery Address Line 4</label><input className="input-rk" value={selectedSource?.deliveryAddressLine4 || selectedCustomerSource?.deliveryAddressLine4 || ""} readOnly disabled /></div>
                    <div><label className="label-rk">City</label><input className="input-rk" value={selectedSource?.deliveryCity || selectedCustomerSource?.deliveryCity || ""} readOnly disabled /></div>
                    <div><label className="label-rk">Post Code</label><input className="input-rk" value={selectedSource?.deliveryPostCode || selectedCustomerSource?.deliveryPostCode || ""} readOnly disabled /></div>
                    <div><label className="label-rk">Country</label><input className="input-rk" value={selectedSource?.deliveryCountryCode || selectedCustomerSource?.deliveryCountryCode || ""} readOnly disabled /></div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="mt-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Generate From</p>
                    <h3 className="mt-3 text-xl font-bold text-white">Delivery Order</h3>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="relative">
                    <label className="label-rk">Delivery Order</label>
                    <button
                      type="button"
                      disabled={!selectedCustomerId}
                      onClick={() => {
                        if (!selectedCustomerId) return;
                        setIsSourcePickerOpen((prev) => !prev);
                      }}
                      className={`input-rk flex items-center justify-between gap-3 pr-16 text-left ${!selectedCustomerId ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span className={selectedSource ? "truncate text-white" : "truncate text-white/45"}>
                        {selectedSource ? `${selectedSource.docNo} — ${selectedSource.customerName}` : "Search or select delivery order"}
                      </span>
                      <span className="shrink-0 pr-5 text-white/60">▾</span>
                    </button>

                    {isSourcePickerOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[150] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
                        <div className="border-b border-white/10 p-3">
                          <input autoFocus className="input-rk" value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} placeholder="Search Delivery Order" />
                        </div>
                        <div className="max-h-64 overflow-y-auto p-2">
                          {filteredSourceDeliveryOrders.length === 0 ? (
                            <div className="rounded-xl px-3 py-3 text-sm text-white/45">No available delivery order found for this customer.</div>
                          ) : (
                            filteredSourceDeliveryOrders.map((source) => (
                              <button
                                key={source.id}
                                type="button"
                                onClick={() => preparePickLines(source.id)}
                                className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left text-sm transition ${
                                  selectedSourceId === source.id ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                                }`}
                              >
                                <div>
                                  <div className="font-semibold">{source.docNo}</div>
                                  <div className="mt-1 text-xs text-white/45">{source.customerName} • {formatDate(source.docDate)}</div>
                                </div>
                                <div className="text-right font-semibold">{source.currency || "MYR"} {money(source.grandTotal)}</div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {!selectedCustomerId ? (
                    <div className="mt-4 rounded-2xl border border-white/10 px-4 py-6 text-sm text-white/45">Please select customer in Header first.</div>
                  ) : null}
                </div>

                {selectedSource ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                        <tr>
                          <th className="px-4 py-4">DO</th>
                          <th className="px-4 py-4">Product</th>
                          <th className="px-4 py-4 text-right">Delivered</th>
                          <th className="px-4 py-4 text-right">Returned</th>
                          <th className="px-4 py-4 text-right">Remaining</th>
                          <th className="px-4 py-4 text-right">Return Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {pickLines.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No returnable stock item found.</td></tr>
                        ) : (
                          pickLines.map((line) => (
                            <tr key={line.key}>
                              <td className="px-4 py-4 text-white/70">{line.sourceDocNo}</td>
                              <td className="px-4 py-4">
                                <div className="font-semibold text-white">{line.productCode}</div>
                                <div className="mt-1 text-xs text-white/45">{line.productDescription}</div>
                                {line.batchNo ? <div className="mt-1 text-xs text-white/45">Batch No: {line.batchNo}</div> : null}
                                {line.serialNos.length > 0 ? <div className="mt-1 text-xs text-white/45">Serial No: {line.serialNos.join(", ")}</div> : null}
                              </td>
                              <td className="px-4 py-4 text-right text-white/75">{money(line.deliveredQty)} {line.uom}</td>
                              <td className="px-4 py-4 text-right text-white/75">{money(line.returnedQty)} {line.uom}</td>
                              <td className="px-4 py-4 text-right text-white/75">{money(line.remainingReturnQty)} {line.uom}</td>
                              <td className="px-4 py-4 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={line.remainingReturnQty}
                                  className="input-rk text-right"
                                  value={line.returnQty}
                                  onChange={(e) => updatePickLine(line.key, { returnQty: sanitizeReturnInput(e.target.value, line.remainingReturnQty) })}
                                  onBlur={(e) => updatePickLine(line.key, { returnQty: sanitizeReturnInput(e.target.value, line.remainingReturnQty) })}
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="mt-8 grid gap-4 md:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <div>
                    <label className="label-rk">Footer Remarks</label>
                    <textarea className="input-rk min-h-[150px] resize-none" value={footerRemarks} onChange={(e) => setFooterRemarks(e.target.value)} placeholder="Enter additional remarks manually." />
                  </div>
                  <div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/55">
                    Delivery Return is posted immediately. Stock items will be stocked-in. Cancelling the DR will reverse the stock movement.
                  </div>
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
              <button type="button" disabled={isSubmitting} onClick={submitDeliveryReturn} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-400 disabled:opacity-60">
                {isSubmitting ? "Creating..." : "Create Delivery Return"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDocNoModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <h3 className="text-xl font-bold">Override Document No</h3>
            <p className="mt-2 text-sm text-white/55">Format: DR-YYYYMMDD-0001</p>
            <input className="input-rk mt-5" value={docNoDraft} onChange={(e) => setDocNoDraft(normalizeDocNoInput(e.target.value))} placeholder={docNoPreview} />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDocNoModalOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/75">Cancel</button>
              <button type="button" onClick={applyDocNoOverride} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Cancel Delivery Return</h3>
            <p className="mt-3 text-sm text-white/65">Cancelling this DR will stock-out the returned qty again.</p>
            <div className="mt-5">
              <label className="label-rk">Cancel Reason <span className="text-rk-red">*</span></label>
              <textarea className="input-rk min-h-[110px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Enter reason" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 hover:bg-white/10">Close</button>
              <button type="button" disabled={isSubmitting} onClick={cancelDeliveryReturn} className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-60">Cancel DR</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
