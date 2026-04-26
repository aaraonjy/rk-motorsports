"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type CustomerOption = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  customerAccountNo?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingAddressLine3?: string | null;
  billingAddressLine4?: string | null;
  billingCity?: string | null;
  billingPostCode?: string | null;
  billingCountryCode?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryAddressLine3?: string | null;
  deliveryAddressLine4?: string | null;
  deliveryCity?: string | null;
  deliveryPostCode?: string | null;
  deliveryCountryCode?: string | null;
  attention?: string | null;
  currency?: string | null;
  agentId?: string | null;
};

type ProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  sellingPrice: number;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  uomConversions?: Array<{ id?: string; uomCode: string; conversionRate: number }>;
};

type AgentOption = { id: string; code: string; name: string; isActive: boolean };
type ProjectOption = { id: string; code: string; name: string; isActive: boolean };
type DepartmentOption = { id: string; code: string; name: string; projectId: string; isActive: boolean };
type StockLocationOption = { id: string; code: string; name: string; isActive: boolean };

type SourceSalesOrderRecord = {
  id: string;
  docNo: string;
  docDate: string;
  docDesc?: string | null;
  customerId?: string | null;
  customerName: string;
  customerAccountNo?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingAddressLine3?: string | null;
  billingAddressLine4?: string | null;
  billingCity?: string | null;
  billingPostCode?: string | null;
  billingCountryCode?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryAddressLine3?: string | null;
  deliveryAddressLine4?: string | null;
  deliveryCity?: string | null;
  deliveryPostCode?: string | null;
  deliveryCountryCode?: string | null;
  attention?: string | null;
  contactNo?: string | null;
  email?: string | null;
  currency?: string | null;
  reference?: string | null;
  remarks?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  termsAndConditions?: string | null;
  bankAccount?: string | null;
  footerRemarks?: string | null;
  status: string;
  grandTotal: string | number;
  lines?: Array<{
    id: string;
    inventoryProductId?: string | null;
    productCode?: string | null;
    productDescription?: string | null;
    uom?: string | null;
    qty?: string | number | null;
    deliveredQty?: string | number | null;
    remainingDeliveryQty?: string | number | null;
    unitPrice?: string | number | null;
    discountRate?: string | number | null;
    discountType?: string | null;
    locationId?: string | null;
    remarks?: string | null;
  }>;
};

type DeliveryOrderRecord = {
  id: string;
  docNo: string;
  docDate: string;
  docDesc?: string | null;
  customerId?: string | null;
  customerName: string;
  customerAccountNo?: string | null;
  status: "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED";
  grandTotal: string | number;
  currency?: string | null;
  sourceLinks?: Array<{ sourceTransaction?: { id: string; docNo?: string | null } | null }>;
};

type Props = {
  initialSalesOrders: SourceSalesOrderRecord[];
  initialCustomers: CustomerOption[];
  initialProducts: ProductOption[];
  initialAgents: AgentOption[];
  initialProjects: ProjectOption[];
  initialDepartments: DepartmentOption[];
  initialLocations: StockLocationOption[];
  defaultLocationId: string;
  projectFeatureEnabled: boolean;
  departmentFeatureEnabled: boolean;
};

type LineForm = {
  sourceLineId: string;
  sourceTransactionId: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  uom: string;
  qty: string;
  unitPrice: string;
  discountRate: string;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  remarks: string;
};

type PickLine = {
  key: string;
  sourceTransactionId: string;
  sourceDocNo: string;
  sourceLineId: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  uom: string;
  orderedQty: number;
  deliveredQty: number;
  remainingDeliveryQty: number;
  unitPrice: number;
  discountRate: number;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  remarks: string;
  deliverQty: string;
};

type SearchableSelectOption = { id: string; label: string; searchText: string };

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "COMPLETED") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  if (status === "PARTIAL") return "border-indigo-500/25 bg-indigo-500/10 text-indigo-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function emptyLine(defaultLocationId = ""): LineForm {
  return {
    sourceLineId: "",
    sourceTransactionId: "",
    inventoryProductId: "",
    productCode: "",
    productDescription: "",
    uom: "",
    qty: "1",
    unitPrice: "0.00",
    discountRate: "0",
    discountType: "PERCENT",
    locationId: defaultLocationId,
    remarks: "",
  };
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

function CompactSelect({ options, value, onChange }: { options: SearchableSelectOption[]; value: string; onChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((item) => item.id === value) || null, [options, value]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setIsOpen((prev) => !prev)} className="input-rk flex items-center justify-between gap-3 pr-20 text-left">
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>{selectedOption?.label || ""}</span>
        <span className="shrink-0 pr-5 text-white/60">▾</span>
      </button>
      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] p-2 shadow-2xl">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                option.id === value ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminDeliveryOrderClient({
  initialSalesOrders,
  initialCustomers,
  initialProducts,
  initialAgents,
  initialProjects,
  initialDepartments,
  initialLocations,
  defaultLocationId,
  projectFeatureEnabled,
  departmentFeatureEnabled,
}: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<DeliveryOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DeliveryOrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isGenerateFromOpen, setIsGenerateFromOpen] = useState(false);
  const [generateFromError, setGenerateFromError] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedSourceOrderIds, setSelectedSourceOrderIds] = useState<string[]>([]);
  const [pickLines, setPickLines] = useState<PickLine[]>([]);

  const [docDate, setDocDate] = useState(todayInput());
  const [docNo, setDocNo] = useState("");
  const [isDocNoModalOpen, setIsDocNoModalOpen] = useState(false);
  const [docNoDraft, setDocNoDraft] = useState("");
  const [autoGeneratedDocNoPreview, setAutoGeneratedDocNoPreview] = useState("Auto Generated");
  const [docDesc, setDocDesc] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerAccountNo, setCustomerAccountNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [attention, setAttention] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [footerRemarks, setFooterRemarks] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine(defaultLocationId)]);

  const statusOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "ALL", label: "All Status", searchText: "all status" },
      { id: "OPEN", label: "Open", searchText: "open" },
      { id: "PARTIAL", label: "Partial", searchText: "partial" },
      { id: "COMPLETED", label: "Completed", searchText: "completed" },
      { id: "CANCELLED", label: "Cancelled", searchText: "cancelled" },
    ],
    []
  );

  const customerOptions = useMemo<SearchableSelectOption[]>(
    () =>
      [...initialCustomers]
        .sort((a, b) => (a.customerAccountNo || "").localeCompare(b.customerAccountNo || "") || a.name.localeCompare(b.name))
        .map((customer) => ({
          id: customer.id,
          label: `${customer.customerAccountNo || "-"} — ${customer.name}`,
          searchText: `${customer.customerAccountNo || ""} ${customer.name} ${customer.email || ""} ${customer.phone || ""}`.toLowerCase(),
        })),
    [initialCustomers]
  );

  const productOptions = useMemo<SearchableSelectOption[]>(
    () =>
      initialProducts.map((product) => ({
        id: product.id,
        label: `${product.code} — ${product.description}`,
        searchText: `${product.code} ${product.description} ${product.baseUom}`.toLowerCase(),
      })),
    [initialProducts]
  );

  const locationOptions = useMemo<SearchableSelectOption[]>(
    () =>
      initialLocations
        .filter((location) => location.isActive)
        .map((location) => ({
          id: location.id,
          label: `${location.code} — ${location.name}`,
          searchText: `${location.code} ${location.name}`.toLowerCase(),
        })),
    [initialLocations]
  );

  const agentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Agent", searchText: "no agent" },
      ...initialAgents.map((agent) => ({ id: agent.id, label: `${agent.code} — ${agent.name}`, searchText: `${agent.code} ${agent.name}`.toLowerCase() })),
    ],
    [initialAgents]
  );

  const projectOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Project", searchText: "no project" },
      ...initialProjects.map((project) => ({ id: project.id, label: `${project.code} — ${project.name}`, searchText: `${project.code} ${project.name}`.toLowerCase() })),
    ],
    [initialProjects]
  );

  const filteredDepartments = useMemo(() => initialDepartments.filter((item) => item.projectId === projectId && item.isActive), [initialDepartments, projectId]);

  const departmentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Department", searchText: "no department" },
      ...filteredDepartments.map((department) => ({
        id: department.id,
        label: `${department.code} — ${department.name}`,
        searchText: `${department.code} ${department.name}`.toLowerCase(),
      })),
    ],
    [filteredDepartments]
  );

  const availableSourceOrders = useMemo(() => {
    return initialSalesOrders.filter((order) => {
      if (!customerId) return false;
      if (order.customerId !== customerId) return false;
      if (order.status === "CANCELLED" || order.status === "COMPLETED") return false;
      return (order.lines || []).some((line) => Number(line.remainingDeliveryQty || 0) > 0);
    });
  }, [customerId, initialSalesOrders]);

  const filteredSourceOrders = useMemo(() => {
    const keyword = sourceSearch.trim().toLowerCase();
    if (!keyword) return availableSourceOrders;
    return availableSourceOrders.filter((order) => `${order.docNo} ${order.customerName} ${order.customerAccountNo || ""}`.toLowerCase().includes(keyword));
  }, [availableSourceOrders, sourceSearch]);

  const selectedSourceOrders = useMemo(() => {
    const selected = new Set(selectedSourceOrderIds);
    return availableSourceOrders.filter((order) => selected.has(order.id));
  }, [availableSourceOrders, selectedSourceOrderIds]);

  const normalizedLines = useMemo(() => {
    return lines.map((line) => {
      const qty = Math.max(0, Number(line.qty || 0));
      const unitPrice = Math.max(0, Number(line.unitPrice || 0));
      const discountValue = Math.max(0, Number(line.discountRate || 0));
      const lineSubtotal = qty * unitPrice;
      const discountAmount = line.discountType === "AMOUNT" ? Math.min(lineSubtotal, discountValue) : lineSubtotal * (discountValue / 100);
      const lineTotal = Math.max(0, lineSubtotal - discountAmount);
      return { ...line, qtyNumber: qty, lineSubtotal, discountAmount, lineTotal };
    });
  }, [lines]);

  const totals = useMemo(() => {
    const subtotal = normalizedLines.reduce((sum, line) => sum + line.lineSubtotal, 0);
    const discountTotal = normalizedLines.reduce((sum, line) => sum + line.discountAmount, 0);
    const grandTotal = normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0);
    return { subtotal, discountTotal, taxTotal: 0, grandTotal };
  }, [normalizedLines]);

  async function loadTransactions() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set("q", searchKeyword.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/sales/delivery-order?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setTransactions(response.ok && data.ok && Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadNextDocNo(nextDocDate = docDate) {
    try {
      const params = new URLSearchParams({ nextDocNo: "1", docDate: nextDocDate });
      const response = await fetch(`/api/admin/sales/delivery-order?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setAutoGeneratedDocNoPreview(response.ok && data?.ok && data.docNo ? data.docNo : "Auto Generated");
    } catch {
      setAutoGeneratedDocNoPreview("Auto Generated");
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    if (isCreateOpen && !docNo) void loadNextDocNo(docDate);
  }, [docDate, isCreateOpen, docNo]);

  function resetForm() {
    setActiveTab("HEADER");
    setDocDate(todayInput());
    setDocNo("");
    setDocNoDraft("");
    setDocDesc("");
    setCustomerId("");
    setCustomerAccountNo("");
    setCustomerName("");
    setAttention("");
    setContactNo("");
    setEmail("");
    setCurrency("MYR");
    setReference("");
    setRemarks("");
    setAgentId("");
    setProjectId("");
    setDepartmentId("");
    setTermsAndConditions("");
    setBankAccount("");
    setFooterRemarks("");
    setLines([emptyLine(defaultLocationId)]);
    setSubmitError("");
    setSubmitSuccess("");
    setGenerateFromError("");
    setSelectedSourceOrderIds([]);
    setPickLines([]);
  }

  async function openCreate() {
    resetForm();
    setIsCreateOpen(true);
    await loadNextDocNo(todayInput());
  }

  function closeForm() {
    setIsCreateOpen(false);
    resetForm();
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setSelectedSourceOrderIds([]);
    setPickLines([]);
    setGenerateFromError("");
    const customer = initialCustomers.find((item) => item.id === nextCustomerId);
    if (!customer) return;
    setCustomerAccountNo(customer.customerAccountNo || "");
    setCustomerName(customer.name || "");
    setAttention(customer.attention || "");
    setContactNo(customer.phone || "");
    setEmail(customer.email || "");
    setCurrency(customer.currency || "MYR");
    setAgentId(customer.agentId || "");
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function handleProductChange(index: number, productId: string) {
    const product = initialProducts.find((item) => item.id === productId);
    if (!product) {
      updateLine(index, { inventoryProductId: "", productCode: "", productDescription: "", uom: "", unitPrice: "0.00" });
      return;
    }
    updateLine(index, {
      inventoryProductId: product.id,
      productCode: product.code,
      productDescription: product.description,
      uom: product.baseUom,
      unitPrice: String(product.sellingPrice.toFixed(2)),
      locationId: lines[index]?.locationId || defaultLocationId,
    });
  }

  function openGenerateFromSalesOrder() {
    setGenerateFromError("");
    setSubmitError("");
    if (!customerId) {
      setGenerateFromError("Please select customer profile first before using Generate From.");
      setActiveTab("HEADER");
      return;
    }
    setSelectedSourceOrderIds([]);
    setPickLines([]);
    setSourceSearch("");
    setIsGenerateFromOpen(true);
  }

  function toggleSourceOrder(orderId: string) {
    setSelectedSourceOrderIds((prev) => (prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]));
  }

  function preparePickLines() {
    if (selectedSourceOrders.length === 0) {
      setGenerateFromError("Please select at least one Sales Order.");
      return;
    }

    const nextLines: PickLine[] = selectedSourceOrders.flatMap((order) =>
      (order.lines || [])
        .filter((line) => Number(line.remainingDeliveryQty || 0) > 0)
        .map((line) => ({
          key: `${order.id}-${line.id}`,
          sourceTransactionId: order.id,
          sourceDocNo: order.docNo,
          sourceLineId: line.id,
          inventoryProductId: line.inventoryProductId || "",
          productCode: line.productCode || "",
          productDescription: line.productDescription || "",
          uom: line.uom || "",
          orderedQty: Number(line.qty || 0),
          deliveredQty: Number(line.deliveredQty || 0),
          remainingDeliveryQty: Number(line.remainingDeliveryQty || 0),
          unitPrice: Number(line.unitPrice || 0),
          discountRate: Number(line.discountRate || 0),
          discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
          locationId: line.locationId || defaultLocationId,
          remarks: line.remarks || "",
          deliverQty: String(Number(line.remainingDeliveryQty || 0)),
        }))
    );

    setPickLines(nextLines);
    setGenerateFromError("");
  }

  function updatePickLine(key: string, value: string) {
    setPickLines((prev) => prev.map((line) => (line.key === key ? { ...line, deliverQty: value } : line)));
  }

  function importPickLines() {
    const validLines = pickLines.filter((line) => Number(line.deliverQty || 0) > 0);
    if (validLines.length === 0) {
      setGenerateFromError("Please enter delivery qty for at least one line.");
      return;
    }
    const overLine = validLines.find((line) => Number(line.deliverQty || 0) > line.remainingDeliveryQty);
    if (overLine) {
      setGenerateFromError(`${overLine.productCode} delivery qty cannot exceed remaining qty.`);
      return;
    }

    const first = selectedSourceOrders[0];
    setDocDate(todayInput());
    setDocNo("");
    setDocNoDraft("");
    setDocDesc(`Generated from ${selectedSourceOrders.map((order) => order.docNo).join(", ")}`);
    setReference(selectedSourceOrders.map((order) => order.docNo).join(", "));
    setRemarks(first?.remarks || "");
    setProjectId(first?.projectId || "");
    setDepartmentId(first?.departmentId || "");
    setTermsAndConditions(first?.termsAndConditions || "");
    setBankAccount(first?.bankAccount || "");
    setFooterRemarks(first?.footerRemarks || "");

    setLines(
      validLines.map((line) => ({
        sourceLineId: line.sourceLineId,
        sourceTransactionId: line.sourceTransactionId,
        inventoryProductId: line.inventoryProductId,
        productCode: line.productCode,
        productDescription: line.productDescription,
        uom: line.uom,
        qty: String(line.deliverQty),
        unitPrice: String(line.unitPrice.toFixed(2)),
        discountRate: String(line.discountRate),
        discountType: line.discountType,
        locationId: line.locationId || defaultLocationId,
        remarks: line.remarks,
      }))
    );

    setIsGenerateFromOpen(false);
    setActiveTab("BODY");
    setSubmitSuccess(`Imported ${validLines.length} Sales Order line(s). Please review and save the Delivery Order.`);
  }

  async function submitDeliveryOrder() {
    setSubmitError("");
    setSubmitSuccess("");
    setIsSubmitting(true);
    try {
      const payload = {
        docDate,
        docNo,
        docDesc,
        customerId,
        currency,
        reference,
        remarks,
        agentId,
        projectId,
        departmentId,
        termsAndConditions,
        bankAccount,
        footerRemarks,
        lines,
      };

      const response = await fetch("/api/admin/sales/delivery-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save delivery order.");

      setIsCreateOpen(false);
      resetForm();
      await loadTransactions();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save delivery order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelDeliveryOrder() {
    if (!cancelTarget) return;
    try {
      const response = await fetch(`/api/admin/sales/delivery-order/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", cancelReason }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to cancel delivery order.");
      setCancelTarget(null);
      setCancelReason("");
      await loadTransactions();
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to cancel delivery order.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">Delivery Order</h1>
          <p className="mt-4 max-w-3xl text-white/70">Create and manage delivery order documents. Delivery Order performs stock out immediately.</p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Delivery Order</p>
            <h2 className="mt-4 text-2xl font-bold">Existing Delivery Order Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">Use Delivery Order to record customer delivery and stock out.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
            Create Delivery Order
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search delivery order no / customer" />
            <CompactSelect options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Generated From</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading delivery orders...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No delivery order found.</td></tr>
              ) : (
                transactions.map((item) => (
                  <tr key={item.id} onClick={() => router.push(`/admin/sales/delivery-order/${item.id}`)} className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]">
                    <td className="px-4 py-4 font-semibold text-white">{item.docNo}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">{item.customerName}</div>
                      <div className="text-xs text-white/45">{item.customerAccountNo || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-white/65">{(item.sourceLinks || []).map((link) => link.sourceTransaction?.docNo).filter(Boolean).join(", ") || "-"}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-4 text-right">{`${item.currency || "MYR"} ${money(Number(item.grandTotal || 0))}`}</td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== "CANCELLED" ? (
                        <button type="button" onClick={(event) => { event.stopPropagation(); setCancelTarget(item); }} className="rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10">
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-white/35">Cancelled</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Delivery Order</p>
                <h2 className="mt-3 text-3xl font-bold">Create Delivery Order</h2>
                {lines.some((line) => line.sourceTransactionId) ? (
                  <p className="mt-3 text-sm text-sky-200">Generated from: {reference || "-"}</p>
                ) : null}
              </div>
              <button type="button" onClick={openGenerateFromSalesOrder} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">
                Generate From
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-red-600 text-white" : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"}`}>
                  {tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}
                </button>
              ))}
            </div>

            {generateFromError ? <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{generateFromError}</div> : null}
            {submitError ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
            {submitSuccess ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}

            {activeTab === "HEADER" ? (
              <div className="mt-6 space-y-6">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="label-rk">Doc Date</label>
                    <input className="input-rk" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                  </div>
                  <div className="xl:col-span-3">
                    <label className="label-rk">System Doc No</label>
                    <button type="button" onClick={() => { setDocNoDraft(docNo); setIsDocNoModalOpen(true); }} className="input-rk flex w-full items-center justify-between gap-3 pr-6 text-left">
                      <span className="truncate text-white">{docNo || autoGeneratedDocNoPreview}</span>
                      <span className="shrink-0 text-xs text-white/50">Click to override</span>
                    </button>
                  </div>

                  <SearchableSelect label="A/C No" placeholder="Search or select customer" options={customerOptions} value={customerId} onChange={(option) => handleCustomerChange(option?.id || "")} />
                  <div><label className="label-rk">Customer Name</label><input className="input-rk" value={customerName} readOnly /></div>
                  <div><label className="label-rk">Email</label><input className="input-rk" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><label className="label-rk">Contact No</label><input className="input-rk" value={contactNo} onChange={(e) => setContactNo(e.target.value)} /></div>
                  <div className="xl:col-span-2"><label className="label-rk">Document Description</label><input className="input-rk" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} /></div>
                  <div><label className="label-rk">Attention</label><input className="input-rk" value={attention} onChange={(e) => setAttention(e.target.value)} /></div>
                  <SearchableSelect label="Agent" placeholder="No Agent" options={agentOptions} value={agentId} onChange={(option) => setAgentId(option?.id || "")} />
                  {projectFeatureEnabled ? <SearchableSelect label="Project" placeholder="No Project" options={projectOptions} value={projectId} onChange={(option) => { setProjectId(option?.id || ""); setDepartmentId(""); }} /> : null}
                  {departmentFeatureEnabled ? <SearchableSelect label="Department" placeholder="No Department" options={departmentOptions} value={departmentId} onChange={(option) => setDepartmentId(option?.id || "")} /> : null}
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="mt-6 rounded-[1.5rem] border border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Products</h3>
                  <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine(defaultLocationId)])} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10">
                    Add Line
                  </button>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[1200px] divide-y divide-white/10 text-sm">
                    <thead className="text-left text-white/45">
                      <tr>
                        <th className="px-3 py-3">Product</th>
                        <th className="px-3 py-3">UOM</th>
                        <th className="px-3 py-3 text-right">Qty</th>
                        <th className="px-3 py-3 text-right">Unit Price</th>
                        <th className="px-3 py-3">Location</th>
                        <th className="px-3 py-3">Remarks</th>
                        <th className="px-3 py-3 text-right">Total</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-white/80">
                      {lines.map((line, index) => (
                        <tr key={index}>
                          <td className="px-3 py-4 min-w-[280px]">
                            <SearchableSelect label="" placeholder="Select product" options={productOptions} value={line.inventoryProductId} onChange={(option) => handleProductChange(index, option?.id || "")} disabled={Boolean(line.sourceLineId)} />
                            {line.productDescription ? <div className="mt-2 text-xs text-white/45">{line.productDescription}</div> : null}
                          </td>
                          <td className="px-3 py-4"><input className="input-rk min-w-[90px]" value={line.uom} onChange={(e) => updateLine(index, { uom: e.target.value.toUpperCase() })} readOnly={Boolean(line.sourceLineId)} /></td>
                          <td className="px-3 py-4"><input className="input-rk min-w-[90px] text-right" type="number" min="0" step="0.001" value={line.qty} onChange={(e) => updateLine(index, { qty: e.target.value })} /></td>
                          <td className="px-3 py-4"><input className="input-rk min-w-[110px] text-right" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} /></td>
                          <td className="px-3 py-4 min-w-[240px]"><SearchableSelect label="" placeholder="Select location" options={locationOptions} value={line.locationId} onChange={(option) => updateLine(index, { locationId: option?.id || "" })} /></td>
                          <td className="px-3 py-4"><input className="input-rk min-w-[180px]" value={line.remarks} onChange={(e) => updateLine(index, { remarks: e.target.value })} /></td>
                          <td className="px-3 py-4 text-right">{money(normalizedLines[index]?.lineTotal || 0)}</td>
                          <td className="px-3 py-4 text-right"><button type="button" onClick={() => setLines((prev) => prev.filter((_, lineIndex) => lineIndex !== index))} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200">Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <div><label className="label-rk">Remarks</label><textarea className="input-rk min-h-[96px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
                  <div><label className="label-rk">Terms & Conditions</label><textarea className="input-rk min-h-[96px]" value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} /></div>
                  <div><label className="label-rk">Bank Account</label><textarea className="input-rk min-h-[96px]" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} /></div>
                  <div><label className="label-rk">Footer Remarks</label><textarea className="input-rk min-h-[96px]" value={footerRemarks} onChange={(e) => setFooterRemarks(e.target.value)} /></div>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 p-5">
                  <h3 className="text-xl font-bold">Delivery Order Summary</h3>
                  <div className="mt-5 space-y-4 text-sm">
                    <div className="flex justify-between gap-4"><span className="text-white/65">Subtotal</span><span>{money(totals.subtotal)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-white/65">Discount</span><span>{money(totals.discountTotal)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-white/65">Tax</span><span>{money(totals.taxTotal)}</span></div>
                    <div className="border-t border-white/10 pt-4"><div className="flex justify-between gap-4 text-xl font-bold"><span>Grand Total ({currency})</span><span>{money(totals.grandTotal)}</span></div></div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={closeForm} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              <button type="button" disabled={isSubmitting} onClick={submitDeliveryOrder} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60">
                {isSubmitting ? "Saving..." : "Create Delivery Order"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isGenerateFromOpen ? (
        <div className="fixed inset-0 z-[150] overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300/80">Generate From</p>
              <h2 className="mt-3 text-3xl font-bold">Pick From Sales Order</h2>
              <p className="mt-3 text-sm text-white/60">Only Sales Orders with remaining delivery qty are shown.</p>
            </div>

            {generateFromError ? <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{generateFromError}</div> : null}

            <div className="mt-6">
              <input className="input-rk" value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} placeholder="Search Sales Order" />
            </div>

            <div className="mt-5 max-h-64 overflow-y-auto rounded-2xl border border-white/10">
              {filteredSourceOrders.length === 0 ? (
                <div className="px-4 py-8 text-center text-white/45">No available Sales Order found for this customer.</div>
              ) : (
                filteredSourceOrders.map((order) => (
                  <label key={order.id} className="flex cursor-pointer items-start gap-3 border-b border-white/10 px-4 py-4 text-sm transition hover:bg-white/[0.04]">
                    <input type="checkbox" checked={selectedSourceOrderIds.includes(order.id)} onChange={() => toggleSourceOrder(order.id)} className="mt-1" />
                    <div>
                      <div className="font-semibold text-white">{order.docNo}</div>
                      <div className="mt-1 text-white/50">{formatDate(order.docDate)} • {order.customerName}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {pickLines.length > 0 ? (
              <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="text-left text-white/45">
                    <tr>
                      <th className="px-4 py-3">SO</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">Ordered</th>
                      <th className="px-4 py-3 text-right">Delivered</th>
                      <th className="px-4 py-3 text-right">Remaining</th>
                      <th className="px-4 py-3 text-right">Deliver Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-white/80">
                    {pickLines.map((line) => (
                      <tr key={line.key}>
                        <td className="px-4 py-4">{line.sourceDocNo}</td>
                        <td className="px-4 py-4"><div className="font-semibold text-white">{line.productCode}</div><div className="text-xs text-white/45">{line.productDescription}</div></td>
                        <td className="px-4 py-4 text-right">{money(line.orderedQty)}</td>
                        <td className="px-4 py-4 text-right">{money(line.deliveredQty)}</td>
                        <td className="px-4 py-4 text-right">{money(line.remainingDeliveryQty)}</td>
                        <td className="px-4 py-4 text-right"><input className="input-rk w-32 text-right" type="number" min="0" max={line.remainingDeliveryQty} step="0.001" value={line.deliverQty} onChange={(e) => updatePickLine(line.key, e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsGenerateFromOpen(false)} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              {pickLines.length > 0 ? (
                <button type="button" onClick={importPickLines} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500">
                  Import
                </button>
              ) : (
                <button type="button" onClick={preparePickLines} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">
                  Load Product
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isDocNoModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <h3 className="text-xl font-bold">Override Document No</h3>
            <p className="mt-2 text-sm text-white/55">Format: DO-YYYYMMDD-0001</p>
            <input className="input-rk mt-5" value={docNoDraft} onChange={(e) => setDocNoDraft(normalizeDocNoInput(e.target.value))} placeholder={autoGeneratedDocNoPreview} />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDocNoModalOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/75">Cancel</button>
              <button type="button" onClick={() => { setDocNo(normalizeDocNoInput(docNoDraft)); setIsDocNoModalOpen(false); }} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <h3 className="text-2xl font-bold">Cancel Delivery Order</h3>
            <p className="mt-3 text-sm text-white/60">Cancelling {cancelTarget.docNo} will reverse the auto stock issue.</p>
            <textarea className="input-rk mt-5 min-h-[110px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Cancellation reason" />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75">Close</button>
              <button type="button" onClick={cancelDeliveryOrder} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white">Confirm Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
