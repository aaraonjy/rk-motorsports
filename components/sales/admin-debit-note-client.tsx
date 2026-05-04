
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type TaxCodeOption = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: string;
};

type ProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  sellingPrice: number;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  trackInventory?: boolean;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
  uomConversions?: Array<{ id?: string; uomCode: string; conversionRate: number }>;
};

type StockLocationOption = { id: string; code: string; name: string; isActive: boolean };
type AgentOption = { id: string; code: string; name: string; isActive: boolean };
type ProjectOption = { id: string; code: string; name: string; isActive: boolean };
type DepartmentOption = { id: string; code: string; name: string; projectId: string; isActive: boolean };

type SourceInvoice = {
  id: string;
  docNo: string;
  docDate: string;
  customerId: string;
  customerName: string;
  customerAccountNo?: string | null;
  email?: string | null;
  contactNo?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingAddressLine3?: string | null;
  billingAddressLine4?: string | null;
  billingCity?: string | null;
  billingPostCode?: string | null;
  billingCountryCode?: string | null;
  attention?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  currency?: string | null;
  grandTotal: string | number;
  totalPaid?: string | number | null;
  totalCredited?: string | number | null;
  totalDebited?: string | number | null;
  adjustedGrandTotal?: string | number | null;
  outstandingBalance?: string | number | null;
};

type DebitNoteRecord = {
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
  sourceLinks?: Array<{ sourceTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
};

type LineForm = {
  key: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  trackInventory: boolean;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  uom: string;
  qty: string;
  unitPrice: string;
  discountRate: string;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  taxCodeId: string;
  batchNo: string;
  serialNos: string[];
  serialSearch: string;
  remarks: string;
};

type SearchableSelectOption = { id: string; label: string; searchText: string };
type AvailableBatch = { id: string; batchNo: string; expiryDate?: string | null; balance?: number | null };
type AvailableSerial = { id: string; serialNo: string; batchNo?: string | null; expiryDate?: string | null };

type Props = {
  initialProducts: ProductOption[];
  initialLocations: StockLocationOption[];
  defaultLocationId: string;
  initialTaxCodes: TaxCodeOption[];
  defaultAdminTaxCodeId?: string | null;
  initialAgents: AgentOption[];
  initialProjects: ProjectOption[];
  initialDepartments: DepartmentOption[];
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}

function isValidManualDocNo(value: string) {
  return /^DN-\d{8}-\d{4}$/.test(value.trim().toUpperCase());
}


function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "COMPLETED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function createEmptyLine(defaultLocationId: string, defaultTaxCodeId = ""): LineForm {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    inventoryProductId: "",
    productCode: "",
    productDescription: "",
    itemType: "STOCK_ITEM",
    trackInventory: false,
    batchTracking: false,
    serialNumberTracking: false,
    uom: "",
    qty: "1",
    unitPrice: "0",
    discountRate: "0",
    discountType: "PERCENT",
    locationId: defaultLocationId,
    taxCodeId: defaultTaxCodeId,
    batchNo: "",
    serialNos: [],
    serialSearch: "",
    remarks: "",
  };
}

function calculateLine(line: LineForm, taxCodes: TaxCodeOption[]) {
  const qty = Math.max(0, Number(line.qty || 0));
  const unitPrice = Math.max(0, Number(line.unitPrice || 0));
  const subtotal = roundMoney(qty * unitPrice);
  const discountRate = Math.max(0, Number(line.discountRate || 0));
  const discountAmount = line.discountType === "AMOUNT" ? Math.min(subtotal, discountRate) : roundMoney(subtotal * (discountRate / 100));
  const taxable = roundMoney(subtotal - discountAmount);
  const taxCode = taxCodes.find((item) => item.id === line.taxCodeId);
  const rate = Math.max(0, Number(taxCode?.rate || 0));
  const method = taxCode?.calculationMethod;
  const taxAmount = rate <= 0 || taxable <= 0 ? 0 : method === "INCLUSIVE" ? roundMoney((taxable * rate) / (100 + rate)) : roundMoney(taxable * (rate / 100));
  const lineTotal = method === "INCLUSIVE" ? taxable : roundMoney(taxable + taxAmount);
  return { subtotal, discountAmount, taxable, taxAmount, lineTotal };
}

function SearchableSelect({ label, placeholder, options, value, disabled = false, onChange }: { label: string; placeholder: string; options: SearchableSelectOption[]; value: string; disabled?: boolean; onChange: (option: SearchableSelectOption | null) => void }) {
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
      <button type="button" disabled={disabled} onClick={() => { if (!disabled) { setIsOpen((prev) => !prev); setSearch(""); } }} className={`input-rk flex items-center justify-between gap-3 pr-20 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>{selectedOption ? selectedOption.label : placeholder}</span>
        <span className="shrink-0 pr-5 text-white/60">▾</span>
      </button>
      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
          <div className="border-b border-white/10 p-3">
            <input className="input-rk h-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." autoFocus />
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? <div className="rounded-xl px-3 py-3 text-sm text-white/45">No result found.</div> : filteredOptions.map((option) => (
              <button key={option.id || "empty"} type="button" onClick={() => { onChange(option); setIsOpen(false); }} className={`w-full rounded-xl px-3 py-3 text-left text-sm transition ${option.id === value ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminDebitNoteClient({ initialProducts, initialLocations, defaultLocationId, initialTaxCodes, defaultAdminTaxCodeId, initialAgents, initialProjects, initialDepartments }: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<DebitNoteRecord[]>([]);
  const pageSize = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const [sourceInvoices, setSourceInvoices] = useState<SourceInvoice[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [sourceSearch, setSourceSearch] = useState("");
  const [isInvoicePickerOpen, setIsInvoicePickerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [docDate, setDocDate] = useState(todayInput());
  const [docNo, setDocNo] = useState("");
  const [docNoPreview, setDocNoPreview] = useState("Auto Generated");
  const [isDocNoModalOpen, setIsDocNoModalOpen] = useState(false);
  const [docNoDraft, setDocNoDraft] = useState("");
  const [docNoOverrideError, setDocNoOverrideError] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [footerRemarks, setFooterRemarks] = useState("");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DebitNoteRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [batchOptions, setBatchOptions] = useState<Record<string, AvailableBatch[]>>({});
  const [serialOptions, setSerialOptions] = useState<Record<string, AvailableSerial[]>>({});

  const defaultTaxCodeId = defaultAdminTaxCodeId || "";
  const selectedInvoice = useMemo(() => sourceInvoices.find((item) => item.id === selectedInvoiceId) || null, [sourceInvoices, selectedInvoiceId]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, SearchableSelectOption>();
    for (const invoice of sourceInvoices) {
      if (!invoice.customerId || map.has(invoice.customerId)) continue;
      const accountNo = invoice.customerAccountNo || "-";
      map.set(invoice.customerId, { id: invoice.customerId, label: `${accountNo} — ${invoice.customerName}`, searchText: `${accountNo} ${invoice.customerName}`.toLowerCase() });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [sourceInvoices]);

  const selectedCustomer = useMemo(() => customerOptions.find((item) => item.id === selectedCustomerId) || null, [customerOptions, selectedCustomerId]);
  const selectedCustomerInvoice = useMemo(() => sourceInvoices.find((item) => item.customerId === selectedCustomerId) || null, [sourceInvoices, selectedCustomerId]);

  const filteredInvoices = useMemo(() => {
    if (!selectedCustomerId) return [];
    const keyword = sourceSearch.trim().toLowerCase();
    const customerInvoices = sourceInvoices.filter((invoice) => invoice.customerId === selectedCustomerId);
    if (!keyword) return customerInvoices;
    return customerInvoices.filter((invoice) => `${invoice.docNo} ${invoice.customerName} ${invoice.customerAccountNo || ""}`.toLowerCase().includes(keyword));
  }, [selectedCustomerId, sourceInvoices, sourceSearch]);

  const productOptions = useMemo<SearchableSelectOption[]>(() => initialProducts.map((product) => ({ id: product.id, label: `${product.code} — ${product.description}`, searchText: `${product.code} ${product.description}`.toLowerCase() })), [initialProducts]);
  const locationOptions = useMemo<SearchableSelectOption[]>(() => initialLocations.map((location) => ({ id: location.id, label: `${location.code} — ${location.name}`, searchText: `${location.code} ${location.name}`.toLowerCase() })), [initialLocations]);
  const agentOptions = useMemo<SearchableSelectOption[]>(() => [{ id: "", label: "No Agent", searchText: "no agent" }, ...initialAgents.map((agent) => ({ id: agent.id, label: `${agent.code} — ${agent.name}`, searchText: `${agent.code} ${agent.name}`.toLowerCase() }))], [initialAgents]);
  const projectOptions = useMemo<SearchableSelectOption[]>(() => [{ id: "", label: "No Project", searchText: "no project" }, ...initialProjects.map((project) => ({ id: project.id, label: `${project.code} — ${project.name}`, searchText: `${project.code} ${project.name}`.toLowerCase() }))], [initialProjects]);
  const departmentOptions = useMemo<SearchableSelectOption[]>(() => [{ id: "", label: "No Department", searchText: "no department" }, ...initialDepartments.filter((department) => !projectId || department.projectId === projectId).map((department) => ({ id: department.id, label: `${department.code} — ${department.name}`, searchText: `${department.code} ${department.name}`.toLowerCase() }))], [initialDepartments, projectId]);

  const totals = useMemo(() => {
    const calculated = lines.filter((line) => line.inventoryProductId && Number(line.qty || 0) > 0).map((line) => calculateLine(line, initialTaxCodes));
    const subtotal = roundMoney(calculated.reduce((sum, line) => sum + line.subtotal, 0));
    const discount = roundMoney(calculated.reduce((sum, line) => sum + line.discountAmount, 0));
    const tax = roundMoney(calculated.reduce((sum, line) => sum + line.taxAmount, 0));
    const grandTotal = roundMoney(calculated.reduce((sum, line) => sum + line.lineTotal, 0));
    return { subtotal, discount, tax, grandTotal };
  }, [lines, initialTaxCodes]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, statusFilter]);

  async function loadTransactions() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set("q", searchKeyword.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));
      const response = await fetch(`/api/admin/sales/debit-note?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      const nextTransactions = response.ok && data.ok && Array.isArray(data.transactions) ? data.transactions : [];
      setTransactions(nextTransactions);
      setTotalRecords(response.ok && data.ok && data.pagination ? Number(data.pagination.total || 0) : nextTransactions.length);
    } catch {
      setTransactions([]);
      setTotalRecords(0);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSourceInvoices() {
    const response = await fetch("/api/admin/sales/debit-note?sourceInvoices=1", { cache: "no-store" });
    const data = await response.json();
    setSourceInvoices(response.ok && data.ok && Array.isArray(data.invoices) ? data.invoices : []);
  }

  async function loadNextDocNo(nextDocDate = docDate) {
    try {
      const response = await fetch(`/api/admin/sales/debit-note?nextDocNo=1&docDate=${encodeURIComponent(nextDocDate)}`, { cache: "no-store" });
      const data = await response.json();
      setDocNoPreview(response.ok && data.ok && data.docNo ? data.docNo : "Auto Generated");
    } catch {
      setDocNoPreview("Auto Generated");
    }
  }

  useEffect(() => { void loadTransactions(); }, [searchKeyword, statusFilter, currentPage]);
  useEffect(() => { if (isCreateOpen && !docNo) void loadNextDocNo(docDate); }, [docDate, isCreateOpen, docNo]);

  async function openCreate() {
    setDocDate(todayInput());
    setDocNo("");
    setDocNoPreview("Auto Generated");
    setReason("");
    setRemarks("");
    setFooterRemarks("");
    setAgentId("");
    setProjectId("");
    setDepartmentId("");
    setSelectedCustomerId("");
    setSelectedInvoiceId("");
    setLines([createEmptyLine(defaultLocationId, defaultTaxCodeId)]);
    setSourceSearch("");
    setIsInvoicePickerOpen(false);
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
    setLines([]);
    setReason("");
    setRemarks("");
    setFooterRemarks("");
    setAgentId("");
    setProjectId("");
    setDepartmentId("");
    setSubmitError("");
    setIsInvoicePickerOpen(false);
  }

  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    setSelectedInvoiceId("");
    setLines([createEmptyLine(defaultLocationId, defaultTaxCodeId)]);
    setSourceSearch("");
    setIsInvoicePickerOpen(false);
  }

  function selectInvoice(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setIsInvoicePickerOpen(false);
    const invoice = sourceInvoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    setAgentId(invoice.agentId || "");
    setProjectId(invoice.projectId || "");
    setDepartmentId(invoice.departmentId || "");
  }

  function openDocNoModal() {
    setDocNoDraft("");
    setDocNoOverrideError("");
    setSubmitError("");
    setIsDocNoModalOpen(true);
  }
  function applyDocNoOverride() {
    const normalized = normalizeDocNoInput(docNoDraft);

    if (!normalized) {
      setDocNo("");
      setDocNoDraft("");
      setDocNoOverrideError("");
      setIsDocNoModalOpen(false);
      return;
    }

    if (!isValidManualDocNo(normalized)) {
      setDocNoOverrideError("Debit Note No must use DN-YYYYMMDD-0001 format.");
      return;
    }

    setDocNo(normalized);
    setDocNoDraft("");
    setDocNoOverrideError("");
    setIsDocNoModalOpen(false);
  }
  function clearDocNoOverride() { setDocNo(""); setDocNoDraft(""); setIsDocNoModalOpen(false); }

  function patchLine(key: string, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function selectProduct(lineKey: string, productId: string) {
    const product = initialProducts.find((item) => item.id === productId);
    if (!product) return;
    patchLine(lineKey, {
      inventoryProductId: product.id,
      productCode: product.code,
      productDescription: product.description,
      itemType: product.itemType,
      trackInventory: product.itemType === "STOCK_ITEM" && Boolean(product.trackInventory ?? true),
      batchTracking: Boolean(product.batchTracking),
      serialNumberTracking: Boolean(product.serialNumberTracking),
      uom: product.baseUom,
      unitPrice: String(product.sellingPrice ?? 0),
      batchNo: "",
      serialNos: [],
      serialSearch: "",
    });
  }

  function addLine() { setLines((prev) => [...prev, createEmptyLine(defaultLocationId, defaultTaxCodeId)]); }
  function removeLine(key: string) { setLines((prev) => prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)); }

  function serialKey(line: LineForm) { return `${line.inventoryProductId}__${line.locationId}__${line.batchNo || ""}`; }
  function batchKey(line: LineForm) { return `${line.inventoryProductId}__${line.locationId}`; }

  async function loadBatches(line: LineForm) {
    if (!line.inventoryProductId || !line.locationId) return;
    const key = batchKey(line);
    const response = await fetch(`/api/admin/stock/batches?inventoryProductId=${encodeURIComponent(line.inventoryProductId)}&locationId=${encodeURIComponent(line.locationId)}&direction=outbound`, { cache: "no-store" });
    const data = await response.json();
    setBatchOptions((prev) => ({ ...prev, [key]: response.ok && data.ok && Array.isArray(data.items) ? data.items : [] }));
  }

  async function loadSerials(line: LineForm) {
    if (!line.inventoryProductId || !line.locationId) return;
    const key = serialKey(line);
    const params = new URLSearchParams({ inventoryProductId: line.inventoryProductId, locationId: line.locationId });
    if (line.batchNo) params.set("batchNo", line.batchNo);
    if (line.serialSearch.trim()) params.set("q", line.serialSearch.trim());
    const response = await fetch(`/api/admin/stock/serials?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    setSerialOptions((prev) => ({ ...prev, [key]: response.ok && data.ok && Array.isArray(data.serials) ? data.serials : [] }));
  }

  function toggleSerial(line: LineForm, serialNo: string) {
    const selected = line.serialNos.includes(serialNo);
    patchLine(line.key, { serialNos: selected ? line.serialNos.filter((item) => item !== serialNo) : [...line.serialNos, serialNo] });
  }

  async function submitDebitNote() {
    if (!selectedCustomerId) { setSubmitError("Customer is required."); return; }
    if (!selectedInvoice) { setSubmitError("Please select Sales Invoice."); return; }
    if (!reason.trim()) { setSubmitError("Debit Note reason is required."); return; }

    const selectedLines = lines.filter((line) => line.inventoryProductId && Number(line.qty || 0) > 0);
    if (selectedLines.length === 0) { setSubmitError("Please add at least one Debit Note line."); return; }

    for (const line of selectedLines) {
      if (!line.productCode.trim()) { setSubmitError("Product is required."); return; }
      if (line.itemType === "STOCK_ITEM" && line.trackInventory) {
        if (!line.locationId) { setSubmitError(`${line.productCode} location is required.`); return; }
        if (line.batchTracking && !line.batchNo.trim()) { setSubmitError(`${line.productCode} Batch No is required.`); return; }
        if (line.serialNumberTracking && line.serialNos.length !== Number(line.qty || 0)) { setSubmitError(`${line.productCode} selected Serial No count must match quantity.`); return; }
      }
    }

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/admin/sales/debit-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docDate,
          docNo: docNo.trim() || undefined,
          sourceTransactionId: selectedInvoice.id,
          reason,
          remarks,
          footerRemarks,
          agentId,
          projectId,
          departmentId,
          lines: selectedLines.map((line) => ({
            inventoryProductId: line.inventoryProductId,
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType: line.itemType,
            uom: line.uom,
            qty: line.qty,
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
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create debit note.");
      closeCreate();
      setSubmitSuccess(`Debit Note ${data.transaction?.docNo || ""} created successfully.`);
      await Promise.all([loadTransactions(), loadSourceInvoices()]);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create debit note.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelDebitNote() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { setSubmitError("Cancel reason is required."); return; }
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/sales/debit-note/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", cancelReason }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to cancel debit note.");
      setCancelTarget(null);
      setCancelReason("");
      setSubmitSuccess(`Debit Note ${cancelTarget.docNo} cancelled successfully.`);
      await Promise.all([loadTransactions(), loadSourceInvoices()]);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to cancel debit note.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">Debit Note</h1>
          <p className="mt-4 max-w-3xl text-white/70">Create and manage debit note documents against sales invoices.</p>
        </div>
      </div>

      {submitSuccess && !isCreateOpen ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
      {submitError && !isCreateOpen ? <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{submitError}</div> : null}

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Debit Note</p>
            <h2 className="mt-4 text-2xl font-bold">Existing Debit Note Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">Use Debit Note to add extra charges after invoice. Stock items will be stocked-out.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">Create Debit Note</button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search debit note no / customer" />
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
                <th className="px-4 py-3">Doc No</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Source INV</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Grand Total</th><th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading debit notes...</td></tr> : transactions.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No debit note found.</td></tr> : transactions.map((transaction) => {
                const sourceInv = transaction.sourceLinks?.[0]?.sourceTransaction?.docNo || transaction.reference || "-";
                return (
                  <tr key={transaction.id} onClick={() => router.push(`/admin/sales/debit-note/${transaction.id}`)} className="cursor-pointer text-white/85 transition hover:bg-white/[0.03]">
                    <td className="px-4 py-5 font-semibold text-white"><a className="hover:text-rk-red" href={`/admin/sales/debit-note/${transaction.id}`}>{transaction.docNo}</a><div className="mt-1 text-xs font-normal text-white/45">{formatDate(transaction.docDate)}</div></td>
                    <td className="px-4 py-5"><div className="font-semibold">{transaction.customerName}</div><div className="mt-1 text-xs text-white/45">{transaction.customerAccountNo || "-"}</div></td>
                    <td className="px-4 py-5 text-white/70">{sourceInv}</td>
                    <td className="px-4 py-5"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(transaction.status)}`}>{transaction.status}</span></td>
                    <td className="px-4 py-5 text-right font-semibold">{transaction.currency || "MYR"} {money(transaction.grandTotal)}</td>
                    <td className="px-4 py-5 text-right">{transaction.status !== "CANCELLED" ? <button type="button" onClick={(event) => { event.stopPropagation(); setCancelTarget(transaction); }} className="rounded-xl border border-red-500/40 px-4 py-2 text-xs text-red-100 transition hover:bg-red-500/10">Cancel</button> : <span className="text-xs text-white/35">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalRecords > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-sm text-white/55">
              <div>
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} records
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLoading}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-xl border border-white/10 px-4 py-2 text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="rounded-xl border border-white/10 px-4 py-2 font-semibold text-white/80">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || isLoading}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="rounded-xl border border-white/10 px-4 py-2 text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

        </div>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-5 shadow-2xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Debit Note</p><h2 className="mt-4 text-3xl font-bold text-white">Create Debit Note</h2></div></div>
            <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-red-600 text-white" : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"}`}>{tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}</button>)}
            </div>
            {submitError ? <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{submitError}</div> : null}

            {activeTab === "HEADER" ? (
              <div className="mt-6 space-y-5">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="label-rk">Doc Date</label>
                    <input className="input-rk" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                  </div>
                  <div className="xl:col-span-3">
                    <label className="label-rk">System Doc No</label>
                    <button type="button" onClick={openDocNoModal} className="input-rk flex w-full items-center justify-between gap-3 pr-6 text-left">
                      <span className="truncate text-white">{docNo || docNoPreview}</span>
                      <span className="shrink-0 text-xs text-white/50">Click to override</span>
                    </button>
                  </div>

                  <SearchableSelect label="A/C No" placeholder="Search or select customer" options={customerOptions} value={selectedCustomerId} onChange={(option) => handleCustomerChange(option?.id || "")} />
                  <div>
                    <label className="label-rk">Customer Name</label>
                    <input className="input-rk" value={selectedCustomerInvoice?.customerName || selectedCustomer?.label?.split(" — ").slice(1).join(" — ") || ""} readOnly />
                  </div>
                  <div>
                    <label className="label-rk">Email</label>
                    <input className="input-rk" value={selectedCustomerInvoice?.email || ""} readOnly />
                  </div>
                  <div>
                    <label className="label-rk">Contact No</label>
                    <input className="input-rk" value={selectedCustomerInvoice?.contactNo || ""} readOnly />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label-rk">Document Description</label>
                    <input className="input-rk" value={selectedInvoice ? `Debit Note for ${selectedInvoice.docNo}` : ""} readOnly />
                  </div>
                  <div>
                    <label className="label-rk">Attention</label>
                    <input className="input-rk" value={selectedInvoice?.attention || selectedCustomerInvoice?.attention || ""} readOnly />
                  </div>
                  <SearchableSelect label="Agent" placeholder="No Agent" options={agentOptions} value={agentId} onChange={(option) => setAgentId(option?.id || "")} />

                  <SearchableSelect label="Project" placeholder="No Project" options={projectOptions} value={projectId} onChange={(option) => { setProjectId(option?.id || ""); setDepartmentId(""); }} />
                  <SearchableSelect label="Department" placeholder="No Department" options={departmentOptions} value={departmentId} onChange={(option) => setDepartmentId(option?.id || "")} />
                  <div className="md:col-span-2">
                    <label className="label-rk">Source Sales Invoice <span className="text-rk-red">*</span></label>
                    <div className="relative">
                      <button
                        type="button"
                        disabled={!selectedCustomerId}
                        onClick={() => setIsInvoicePickerOpen((prev) => !prev)}
                        className={`input-rk flex w-full items-center justify-between gap-3 pr-6 text-left ${!selectedCustomerId ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <span className={selectedInvoice ? "truncate text-white" : "truncate text-white/45"}>
                          {selectedInvoice ? `${selectedInvoice.docNo} — ${selectedInvoice.customerName}` : selectedCustomerId ? "Search or select sales invoice" : "Please select customer first"}
                        </span>
                        <span className="shrink-0 text-white/55">▾</span>
                      </button>

                      {isInvoicePickerOpen ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[150] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
                          <div className="border-b border-white/10 p-3">
                            <input className="input-rk h-10" value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} placeholder="Search Sales Invoice" autoFocus />
                          </div>
                          <div className="max-h-64 overflow-y-auto p-2">
                            {filteredInvoices.length === 0 ? (
                              <div className="rounded-xl px-3 py-3 text-sm text-white/45">No available sales invoice found for this customer.</div>
                            ) : (
                              filteredInvoices.map((invoice) => (
                                <button
                                  key={invoice.id}
                                  type="button"
                                  onClick={() => selectInvoice(invoice.id)}
                                  className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left text-sm transition ${selectedInvoiceId === invoice.id ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
                                >
                                  <div>
                                    <div className="font-semibold">{invoice.docNo}</div>
                                    <div className="mt-1 text-xs text-white/45">{invoice.customerName} • {formatDate(invoice.docDate)}</div>
                                  </div>
                                  <div className="text-right font-semibold">{invoice.currency || "MYR"} {money(invoice.grandTotal)}</div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="label-rk">Reason <span className="text-rk-red">*</span></label>
                    <input className="input-rk" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Additional charge / undercharged item" />
                  </div>
                </div>

                <div>
                  <label className="label-rk">Remarks</label>
                  <textarea className="input-rk min-h-[90px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </div>

                <div className="rounded-[1.75rem] border border-white/10 p-5">
                  <div className="mb-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">Billing Address</p>
                    <p className="mt-2 text-sm text-white/55">Billing address used for this Debit Note.</p>
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div><label className="label-rk">Billing Address Line 1</label><input className="input-rk" value={selectedInvoice?.billingAddressLine1 || ""} readOnly /></div>
                    <div><label className="label-rk">Billing Address Line 2</label><input className="input-rk" value={selectedInvoice?.billingAddressLine2 || ""} readOnly /></div>
                    <div><label className="label-rk">Billing Address Line 3</label><input className="input-rk" value={selectedInvoice?.billingAddressLine3 || ""} readOnly /></div>
                    <div><label className="label-rk">Billing Address Line 4</label><input className="input-rk" value={selectedInvoice?.billingAddressLine4 || ""} readOnly /></div>
                    <div><label className="label-rk">City</label><input className="input-rk" value={selectedInvoice?.billingCity || ""} readOnly /></div>
                    <div><label className="label-rk">Post Code</label><input className="input-rk" value={selectedInvoice?.billingPostCode || ""} readOnly /></div>
                    <div><label className="label-rk">Country Code</label><input className="input-rk" value={selectedInvoice?.billingCountryCode || "MY"} readOnly /></div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="mt-6 space-y-5">
                {!selectedInvoice ? <div className="rounded-2xl border border-white/10 px-4 py-6 text-sm text-white/45">Please select customer and source Sales Invoice in Header first.</div> : null}

                {lines.map((line, index) => {
                  const product = initialProducts.find((item) => item.id === line.inventoryProductId) || null;
                  const uomOptions = [product?.baseUom, ...(product?.uomConversions || []).map((item) => item.uomCode)].filter(Boolean) as string[];
                  const calculated = calculateLine(line, initialTaxCodes);
                  const availableBatches = batchOptions[batchKey(line)] || [];
                  const availableSerials = serialOptions[serialKey(line)] || [];
                  const trackingInfo = product
                    ? [product.batchTracking ? "Batch Tracked" : "", product.serialNumberTracking ? "Serial Tracked" : ""].filter(Boolean).join(" • ")
                    : "";

                  return (
                    <div key={line.key} className="rounded-[1.75rem] border border-white/10 p-5">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-white">Product {index + 1}</h3>
                        {lines.length > 1 ? <button type="button" onClick={() => removeLine(line.key)} className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10">Remove</button> : null}
                      </div>

                      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <div className="md:col-span-2">
                          <SearchableSelect label="Product" placeholder="Search or select product" options={productOptions} value={line.inventoryProductId} onChange={(option) => selectProduct(line.key, option?.id || "")} />
                          {trackingInfo || line.productDescription ? <p className="mt-2 text-xs text-white/45">{trackingInfo || line.productDescription}</p> : null}
                        </div>

                        <div>
                          <label className="label-rk">UOM</label>
                          <div className="relative">
                            <select className="input-rk w-full appearance-none pr-12" value={line.uom} onChange={(e) => patchLine(line.key, { uom: e.target.value })}>
                              {uomOptions.length === 0 ? <option value="">Select UOM</option> : uomOptions.map((uom) => <option key={uom} value={uom}>{uom}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/60">▾</span>
                          </div>
                        </div>

                        <div>
                          <label className="label-rk">Qty</label>
                          <input className="input-rk" type="number" min="0" value={line.qty} onChange={(e) => patchLine(line.key, { qty: e.target.value })} />
                        </div>

                        <div>
                          <label className="label-rk">Selling Price</label>
                          <input className="input-rk" type="number" min="0" value={line.unitPrice} onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })} />
                        </div>

                        <div>
                          <label className="label-rk">Discount</label>
                          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                            <input className="input-rk" type="number" min="0" value={line.discountRate} onChange={(e) => patchLine(line.key, { discountRate: e.target.value })} />
                            <div className="relative">
                              <select className="input-rk w-full appearance-none pr-12" value={line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT"} onChange={(e) => patchLine(line.key, { discountType: e.target.value === "AMOUNT" ? "AMOUNT" : "PERCENT" })}>
                                <option value="PERCENT">%</option>
                                <option value="AMOUNT">RM</option>
                              </select>
                              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/60">▾</span>
                            </div>
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <SearchableSelect label="Location" placeholder="Search or select location" options={locationOptions} value={line.locationId} onChange={(option) => patchLine(line.key, { locationId: option?.id || "", batchNo: "", serialNos: [] })} />
                          <p className="mt-2 text-xs text-white/45">Select product and location before loading batch / serial no.</p>
                        </div>

                        {line.itemType === "STOCK_ITEM" && line.trackInventory && line.batchTracking ? (
                          <div className="md:col-span-2">
                            <label className="label-rk">Batch No <span className="text-rk-red">*</span></label>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                              <input className="input-rk" value={line.batchNo} onChange={(e) => patchLine(line.key, { batchNo: e.target.value, serialNos: [] })} placeholder="Enter or select batch" />
                              <button type="button" onClick={() => loadBatches(line)} className="rounded-xl border border-white/15 px-4 text-sm text-white/75 hover:bg-white/10">Load</button>
                            </div>
                            {availableBatches.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {availableBatches.map((batch) => <button key={batch.id} type="button" onClick={() => patchLine(line.key, { batchNo: batch.batchNo, serialNos: [] })} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/10">{batch.batchNo}{batch.balance != null ? ` (${batch.balance})` : ""}</button>)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {line.itemType === "STOCK_ITEM" && line.trackInventory && line.serialNumberTracking ? (
                          <div className="md:col-span-2">
                            <label className="label-rk">S/N No <span className="text-rk-red">*</span></label>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                              <input className="input-rk" value={line.serialSearch} onChange={(e) => patchLine(line.key, { serialSearch: e.target.value })} placeholder="Search serial no" />
                              <button type="button" onClick={() => loadSerials(line)} className="rounded-xl border border-white/15 px-4 text-sm text-white/75 hover:bg-white/10">Load</button>
                            </div>
                            <div className="mt-2 text-xs text-white/45">Selected: {line.serialNos.length ? line.serialNos.join(", ") : "-"}</div>
                            {availableSerials.length > 0 ? (
                              <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-white/10 p-2">
                                {availableSerials.map((serial) => <button key={serial.id} type="button" onClick={() => toggleSerial(line, serial.serialNo)} className={`mb-1 mr-1 rounded-lg border px-3 py-1 text-xs ${line.serialNos.includes(serial.serialNo) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-white/70 hover:bg-white/10"}`}>{serial.serialNo}</button>)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div>
                          <label className="label-rk">Tax Code</label>
                          <div className="relative">
                            <select className="input-rk w-full appearance-none pr-12" value={line.taxCodeId} onChange={(e) => patchLine(line.key, { taxCodeId: e.target.value })}>
                              <option value="">No Tax</option>
                              {initialTaxCodes.map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.code} — {Number(taxCode.rate || 0)}%</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/60">▾</span>
                          </div>
                        </div>

                        <div>
                          <label className="label-rk">Tax Amount</label>
                          <input className="input-rk" value={money(calculated.taxAmount)} readOnly />
                        </div>

                        <div>
                          <label className="label-rk">Gross Amount</label>
                          <input className="input-rk" value={money(calculated.lineTotal)} readOnly />
                        </div>

                        <div className="md:col-span-4">
                          <label className="label-rk">Product Remarks</label>
                          <textarea className="input-rk min-h-[90px]" value={line.remarks} onChange={(e) => patchLine(line.key, { remarks: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button type="button" onClick={addLine} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">+ Add Product</button>
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="mt-8 grid gap-4 md:grid-cols-[1fr_360px]"><div className="space-y-5"><div><label className="label-rk">Footer Remarks</label><textarea className="input-rk min-h-[150px] resize-none" value={footerRemarks} onChange={(e) => setFooterRemarks(e.target.value)} placeholder="Enter additional remarks manually." /></div><div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/55">Debit Note is posted immediately as COMPLETED. Stock items will be stocked-out. Cancelling the DN will reverse the stock movement.</div></div><div className="rounded-2xl border border-white/10 p-5"><div className="flex justify-between text-white/70"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="mt-3 flex justify-between text-white/70"><span>Discount</span><span>{money(totals.discount)}</span></div><div className="mt-3 flex justify-between text-white/70"><span>Tax</span><span>{money(totals.tax)}</span></div><div className="mt-5 flex justify-between border-t border-white/10 pt-5 text-xl font-bold text-white"><span>Grand Total</span><span>{money(totals.grandTotal)}</span></div></div></div>
            ) : null}

            <div className="mt-8 flex justify-end gap-3"><button type="button" onClick={closeCreate} className="rounded-xl border border-white/15 px-6 py-3 text-sm text-white/75 hover:bg-white/10">Close</button><button type="button" disabled={isSubmitting} onClick={submitDebitNote} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-400 disabled:opacity-60">{isSubmitting ? "Creating..." : "Create Debit Note"}</button></div>
          </div>
        </div>
      ) : null}

      {isDocNoModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">Manual Document No</p>
            <h3 className="mt-3 text-2xl font-bold">Override Document No</h3>
            <p className="mt-3 text-sm leading-6 text-white/65">Leave empty to use the auto generated document number. Maximum 30 characters.</p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="label-rk">Auto Generated Preview</label>
                <div className="input-rk flex items-center text-white">{docNoPreview}</div>
              </div>
              <div>
                <label className="label-rk">Custom Document No</label>
                <input
                  className="input-rk"
                  value={docNoDraft}
                  onChange={(e) => { setDocNoDraft(normalizeDocNoInput(e.target.value)); setDocNoOverrideError(""); }}
                  placeholder="Enter custom document no"
                />
                {docNoOverrideError ? <p className="mt-2 text-sm text-red-300">{docNoOverrideError}</p> : null}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setDocNoOverrideError(""); setIsDocNoModalOpen(false); }} className="rounded-xl border border-white/15 px-4 py-3 text-white/75 transition hover:bg-white/10">Cancel</button>
              <button type="button" onClick={applyDocNoOverride} className="rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">OK</button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl"><h3 className="text-xl font-bold text-white">Cancel Debit Note</h3><p className="mt-3 text-sm text-white/65">Cancelling this DN will stock-in the debited stock qty and remove the sales increase effect.</p><div className="mt-5"><label className="label-rk">Cancel Reason <span className="text-rk-red">*</span></label><textarea className="input-rk min-h-[110px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Enter reason" /></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 hover:bg-white/10">Close</button><button type="button" disabled={isSubmitting} onClick={cancelDebitNote} className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-60">Cancel DN</button></div></div></div> : null}
    </div>
  );
}
