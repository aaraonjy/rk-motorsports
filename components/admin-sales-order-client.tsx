"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  getTaxDisplayLabel,
  normalizeTaxCalculationMode,
  roundMoney,
  type TaxCalculationMethodValue,
  type TaxCalculationModeValue,
} from "@/lib/tax";

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

type ProductUomConversionOption = {
  id?: string;
  uomCode: string;
  conversionRate: number;
};

type ProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  sellingPrice: number;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  uomConversions?: ProductUomConversionOption[];
};

type AgentOption = { id: string; code: string; name: string; isActive: boolean };
type ProjectOption = { id: string; code: string; name: string; isActive: boolean };
type DepartmentOption = { id: string; code: string; name: string; projectId: string; isActive: boolean };

type StockLocationOption = { id: string; code: string; name: string; isActive: boolean };

type TaxCodeOption = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: TaxCalculationMethodValue;
};

type SourceQuotationRecord = {
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
  taxCodeId?: string | null;
  termsAndConditions?: string | null;
  bankAccount?: string | null;
  footerRemarks?: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  grandTotal: string | number;
  revisedFrom?: { id: string; docNo?: string | null } | null;
  revisions?: Array<{ id: string; docNo?: string | null; status?: string | null }>;
  targetLinks?: Array<{
    targetTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null;
  }>;
  lines?: Array<{
    inventoryProductId?: string | null;
    productCode?: string | null;
    productDescription?: string | null;
    uom?: string | null;
    qty?: string | number | null;
    unitPrice?: string | number | null;
    discountRate?: string | number | null;
    discountType?: string | null;
    locationId?: string | null;
    taxCodeId?: string | null;
    remarks?: string | null;
  }>;
};

type SalesOrderRecord = {
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
  taxCodeId?: string | null;
  termsAndConditions?: string | null;
  bankAccount?: string | null;
  footerRemarks?: string | null;
  status: "OPEN" | "CONFIRMED" | "PARTIAL" | "COMPLETED" | "CANCELLED";
  grandTotal: string | number;
  revisedFrom?: { id: string; docNo?: string | null } | null;
  revisions?: Array<{ id: string; docNo?: string | null; status?: string | null }>;
  lines?: Array<{
    inventoryProductId?: string | null;
    productCode?: string | null;
    productDescription?: string | null;
    uom?: string | null;
    qty?: string | number | null;
    unitPrice?: string | number | null;
    discountRate?: string | number | null;
    discountType?: string | null;
    locationId?: string | null;
    taxCodeId?: string | null;
    remarks?: string | null;
  }>;
};

type Props = {
  initialQuotations: SourceQuotationRecord[];
  initialCustomers: CustomerOption[];
  initialProducts: ProductOption[];
  initialAgents: AgentOption[];
  initialProjects: ProjectOption[];
  initialDepartments: DepartmentOption[];
  initialLocations: StockLocationOption[];
  defaultLocationId: string;
  projectFeatureEnabled: boolean;
  departmentFeatureEnabled: boolean;
  taxConfig: {
    taxModuleEnabled: boolean;
    taxCalculationMode: TaxCalculationModeValue;
    defaultAdminTaxCodeId?: string | null;
    taxCodes: TaxCodeOption[];
  };
};

type LineForm = {
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  uom: string;
  qty: string;
  unitPrice: string;
  discountRate: string;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  taxRate: string;
  taxCodeId: string;
  remarks: string;
};

function emptyLine(defaultTaxCodeId = "", defaultLocationId = ""): LineForm {
  return {
    inventoryProductId: "",
    productCode: "",
    productDescription: "",
    uom: "",
    qty: "1",
    unitPrice: "0.00",
    discountRate: "0",
    discountType: "PERCENT",
    locationId: defaultLocationId,
    taxRate: "0",
    taxCodeId: defaultTaxCodeId,
    remarks: "",
  };
}

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

function formatDateInput(value: string | Date | null | undefined) {
  if (!value) return todayInput();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayInput();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : todayInput();
}

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "CONFIRMED") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  if (status === "COMPLETED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function formatTaxOptionLabel(taxCode: TaxCodeOption) {
  return taxCode.code;
}

function getProductUomOptions(product: ProductOption | null | undefined) {
  if (!product) return [];

  const seen = new Set<string>();
  const options: SearchableSelectOption[] = [];

  function pushOption(uomCode: string, conversionRate: number, baseUom: string) {
    const normalized = String(uomCode || "").trim().toUpperCase();
    const normalizedBaseUom = String(baseUom || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;

    seen.add(normalized);
    options.push({
      id: normalized,
      label: normalized === normalizedBaseUom ? `${normalized} (Base UOM)` : `${normalized} (1 = ${conversionRate} ${baseUom})`,
      searchText: `${normalized} ${baseUom} ${conversionRate}`.toLowerCase(),
    });
  }

  pushOption(product.baseUom, 1, product.baseUom);

  for (const item of product.uomConversions || []) {
    if (Number(item.conversionRate) > 0) {
      pushOption(item.uomCode, Number(item.conversionRate), product.baseUom);
    }
  }

  return options;
}

function getProductTrackingInfo(product: ProductOption | null | undefined) {
  if (!product) return "";

  const info: string[] = [];

  if (product.batchTracking) info.push("Batch Tracked");
  if (product.serialNumberTracking) info.push("Serial Tracked");

  return info.join(" • ");
}

type SearchableSelectOption = {
  id: string;
  label: string;
  searchText: string;
};

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

  useEffect(() => {
    setSearch(selectedOption?.label || "");
  }, [selectedOption?.label]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
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
            <input
              autoFocus
              className="input-rk"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
            />
          </div>

          <div className="max-h-56 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-sm text-white/45">No matching {label.toLowerCase()} found.</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedOption?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option);
                      setSearch(option.label);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                      isSelected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


function CompactSelect({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((item) => item.id === value) || null, [options, value]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button type="button" onClick={() => setIsOpen((prev) => !prev)} className="input-rk flex items-center justify-between gap-3 pr-20 text-left">
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>{selectedOption?.label || ""}</span>
        <span className="shrink-0 pr-5 text-white/60">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] p-2 shadow-2xl">
          {options.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                  isSelected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}

function buildSalesOrderDocNoPreview(value: string, transactions: Array<{ docNo?: string | null }>) {
  const normalizedDate = String(value || "").trim();
  const matchDate = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matchDate) return "Auto Generated";

  const prefix = `SO-${matchDate[1]}${matchDate[2]}${matchDate[3]}`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let maxSeq = 0;

  for (const item of transactions) {
    const effectiveDocNo = String(item.docNo || "");
    const match = effectiveDocNo.match(new RegExp(`^${escapedPrefix}-(\\d{4})$`));
    if (!match) continue;

    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
}


function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBaseSalesOrderDocNo(docNo: string | null | undefined) {
  const value = String(docNo || "").trim().toUpperCase();
  const match = value.match(/^(SO-\d{8}-\d{4})(?:-(\d+))?$/);
  return match ? match[1] : value;
}

function buildSalesOrderRevisionDocNoPreview(transaction: SalesOrderRecord) {
  const baseDocNo = getBaseSalesOrderDocNo(transaction.revisedFrom?.docNo || transaction.docNo);
  let maxRevision = 0;

  for (const revision of transaction.revisions || []) {
    const value = String(revision.docNo || "").trim().toUpperCase();
    const match = value.match(new RegExp(`^${escapeRegExp(baseDocNo)}-(\\d+)$`));
    if (!match) continue;

    const revisionNo = Number(match[1]);
    if (Number.isFinite(revisionNo) && revisionNo > maxRevision) maxRevision = revisionNo;
  }

  const currentValue = String(transaction.docNo || "").trim().toUpperCase();
  const currentMatch = currentValue.match(new RegExp(`^${escapeRegExp(baseDocNo)}-(\\d+)$`));
  if (currentMatch) {
    const currentRevisionNo = Number(currentMatch[1]);
    if (Number.isFinite(currentRevisionNo) && currentRevisionNo > maxRevision) maxRevision = currentRevisionNo;
  }

  return `${baseDocNo}-${maxRevision + 1}`;
}

type BalanceResponse = { ok?: boolean; balance?: number; error?: string };

function balanceKey(productId: string, locationId: string) {
  return `${productId}__${locationId}`;
}

function getBalanceDisplay(value: number | undefined, isLoading: boolean) {
  if (isLoading) return "Loading balance...";
  if (typeof value !== "number") return "Select product and location to view balance.";
  return `Current Balance: ${money(value)}`;
}


export function AdminSalesOrderClient({
  initialQuotations,
  initialCustomers,
  initialProducts,
  initialAgents,
  initialProjects,
  initialDepartments,
  initialLocations,
  defaultLocationId,
  projectFeatureEnabled,
  departmentFeatureEnabled,
  taxConfig,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<SalesOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SalesOrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | "revise">("create");
  const [editTarget, setEditTarget] = useState<SalesOrderRecord | null>(null);
  const [sourceQuotationId, setSourceQuotationId] = useState("");
  const [sourceQuotationIds, setSourceQuotationIds] = useState<string[]>([]);
  const [isGenerateFromOpen, setIsGenerateFromOpen] = useState(false);
  const [quotationSearch, setQuotationSearch] = useState("");
  const [generateFromError, setGenerateFromError] = useState("");

  const [docDate, setDocDate] = useState(todayInput());
  const [docNo, setDocNo] = useState("");
  const [isDocNoModalOpen, setIsDocNoModalOpen] = useState(false);
  const [docNoDraft, setDocNoDraft] = useState("");
  const [docDesc, setDocDesc] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerAccountNo, setCustomerAccountNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [billingAddressLine1, setBillingAddressLine1] = useState("");
  const [billingAddressLine2, setBillingAddressLine2] = useState("");
  const [billingAddressLine3, setBillingAddressLine3] = useState("");
  const [billingAddressLine4, setBillingAddressLine4] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingPostCode, setBillingPostCode] = useState("");
  const [billingCountryCode, setBillingCountryCode] = useState("MY");
  const [deliveryAddressLine1, setDeliveryAddressLine1] = useState("");
  const [deliveryAddressLine2, setDeliveryAddressLine2] = useState("");
  const [deliveryAddressLine3, setDeliveryAddressLine3] = useState("");
  const [deliveryAddressLine4, setDeliveryAddressLine4] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryPostCode, setDeliveryPostCode] = useState("");
  const [deliveryCountryCode, setDeliveryCountryCode] = useState("MY");
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
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState(taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : "");
  const [lines, setLines] = useState<LineForm[]>([
    emptyLine(
      taxConfig.taxModuleEnabled && normalizeTaxCalculationMode(taxConfig.taxCalculationMode) === "LINE_ITEM" ? taxConfig.defaultAdminTaxCodeId || "" : "",
      defaultLocationId
    ),
  ]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState<Record<string, boolean>>({});

  const filteredDepartments = useMemo(
    () => initialDepartments.filter((item) => item.projectId === projectId && item.isActive),
    [initialDepartments, projectId]
  );

  const customerOptions = useMemo<SearchableSelectOption[]>(
    () =>
      [...initialCustomers]
        .sort((a, b) => {
          const accountA = (a.customerAccountNo || "").toLowerCase();
          const accountB = (b.customerAccountNo || "").toLowerCase();
          if (accountA !== accountB) return accountA.localeCompare(accountB);
          return a.name.localeCompare(b.name);
        })
        .map((customer) => ({
          id: customer.id,
          label: `${customer.customerAccountNo || "-"} — ${customer.name}`,
          searchText: `${customer.customerAccountNo || ""} ${customer.name} ${customer.email || ""} ${customer.phone || ""}`.toLowerCase(),
        })),
    [initialCustomers]
  );

  const agentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Agent", searchText: "no agent" },
      ...initialAgents.map((agent) => ({
        id: agent.id,
        label: `${agent.code} — ${agent.name}`,
        searchText: `${agent.code} ${agent.name}`.toLowerCase(),
      })),
    ],
    [initialAgents]
  );

  const projectOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Project", searchText: "no project" },
      ...initialProjects.map((project) => ({
        id: project.id,
        label: `${project.code} — ${project.name}`,
        searchText: `${project.code} ${project.name}`.toLowerCase(),
      })),
    ],
    [initialProjects]
  );

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

  const [autoGeneratedDocNoPreview, setAutoGeneratedDocNoPreview] = useState("Auto Generated");

  const taxCalculationMode = normalizeTaxCalculationMode(taxConfig.taxCalculationMode);
  const isTaxEnabled = Boolean(taxConfig.taxModuleEnabled);
  const isLineItemTaxMode = Boolean(isTaxEnabled && taxCalculationMode === "LINE_ITEM");
  const availableTaxCodes = useMemo(() => taxConfig.taxCodes || [], [taxConfig.taxCodes]);
  const taxCodeOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Tax", searchText: "no tax" },
      ...availableTaxCodes.map((taxCode) => ({
        id: taxCode.id,
        label: formatTaxOptionLabel(taxCode),
        searchText: `${taxCode.code} ${taxCode.description} ${taxCode.rate}`.toLowerCase(),
      })),
    ],
    [availableTaxCodes]
  );
  const selectedTaxCode = useMemo(
    () => availableTaxCodes.find((item) => item.id === selectedTaxCodeId) || null,
    [availableTaxCodes, selectedTaxCodeId]
  );

  const statusOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "ALL", label: "All Status", searchText: "all status" },
      { id: "OPEN", label: "Open", searchText: "open" },
      { id: "CONFIRMED", label: "Confirmed", searchText: "confirmed" },
      { id: "PARTIAL", label: "Partial", searchText: "partial" },
      { id: "COMPLETED", label: "Completed", searchText: "completed" },
      { id: "CANCELLED", label: "Cancelled", searchText: "cancelled" },
    ],
    []
  );

  const discountTypeOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "PERCENT", label: "%", searchText: "percent %" },
      { id: "AMOUNT", label: "RM", searchText: "amount rm" },
    ],
    []
  );

  const availableSourceQuotations = useMemo(() => {
    return initialQuotations.filter((quotation) => {
      if (!customerId) return false;
      if (quotation.customerId !== customerId) return false;
      if (quotation.status !== "PENDING") return false;

      const hasActiveDownstreamSalesDocument = (quotation.targetLinks || []).some((link) => {
        const target = link.targetTransaction;
        if (!target || target.status === "CANCELLED") return false;
        return ["SO", "DO", "INV", "CS"].includes(String(target.docType || "").toUpperCase());
      });
      if (hasActiveDownstreamSalesDocument) return false;

      return true;
    });
  }, [customerId, initialQuotations]);

  const filteredSourceQuotations = useMemo(() => {
    const keyword = quotationSearch.trim().toLowerCase();
    if (!keyword) return availableSourceQuotations;
    return availableSourceQuotations.filter((quotation) =>
      `${quotation.docNo} ${quotation.customerName} ${quotation.customerAccountNo || ""}`.toLowerCase().includes(keyword)
    );
  }, [availableSourceQuotations, quotationSearch]);

  const selectedSourceQuotations = useMemo(() => {
    const selected = new Set(sourceQuotationIds);
    return availableSourceQuotations.filter((quotation) => selected.has(quotation.id));
  }, [availableSourceQuotations, sourceQuotationIds]);


  function openDocNoModal() {
    setDocNoDraft(docNo);
    setIsDocNoModalOpen(true);
  }

  function saveDocNoOverride() {
    setDocNo(normalizeDocNoInput(docNoDraft));
    setIsDocNoModalOpen(false);
  }

  const normalizedLines = useMemo(() => {
    return lines.map((line) => {
      const qty = Math.max(0, Number(line.qty || 0));
      const unitPrice = Math.max(0, Number(line.unitPrice || 0));
      const discountValue = Math.max(0, Number(line.discountRate || 0));
      const discountRate = line.discountType === "PERCENT" ? discountValue : 0;
      const lineSubtotal = roundMoney(qty * unitPrice);
      const discountAmount = line.discountType === "AMOUNT" ? Math.min(lineSubtotal, roundMoney(discountValue)) : roundMoney(lineSubtotal * (discountValue / 100));
      const taxableAmount = Math.max(0, roundMoney(lineSubtotal - discountAmount));
      const lineTaxCode = isLineItemTaxMode ? availableTaxCodes.find((item) => item.id === line.taxCodeId) || null : null;
      const lineTaxBreakdown = calculateLineItemTaxBreakdown({
        lineTotal: taxableAmount,
        taxRate: lineTaxCode?.rate ?? null,
        calculationMethod: lineTaxCode?.calculationMethod ?? null,
        taxEnabled: Boolean(isLineItemTaxMode && lineTaxCode),
      });

      return {
        ...line,
        qtyNumber: qty,
        unitPriceNumber: unitPrice,
        discountRateNumber: discountRate,
        discountType: line.discountType,
        lineSubtotal,
        discountAmount,
        taxableAmount,
        lineTaxCode,
        taxAmount: lineTaxBreakdown.taxAmount,
        lineTotal: lineTaxBreakdown.lineGrandTotalAfterTax,
      };
    });
  }, [availableTaxCodes, isLineItemTaxMode, lines]);

  const totals = useMemo(() => {
    const subtotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
    const discountTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.discountAmount, 0));
    const taxableSubtotal = Math.max(0, roundMoney(subtotal - discountTotal));
    const lineTaxTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.taxAmount, 0));
    const lineGrandTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0));
    const transactionTaxBreakdown = calculateTaxBreakdown({
      subtotal,
      discount: discountTotal,
      taxRate: selectedTaxCode?.rate ?? null,
      calculationMethod: selectedTaxCode?.calculationMethod ?? null,
      taxEnabled: Boolean(isTaxEnabled && !isLineItemTaxMode && selectedTaxCode),
    });

    return {
      subtotal,
      discountTotal,
      taxableSubtotal,
      taxTotal: isLineItemTaxMode ? lineTaxTotal : transactionTaxBreakdown.taxAmount,
      grandTotal: isLineItemTaxMode ? lineGrandTotal : transactionTaxBreakdown.grandTotalAfterTax,
    };
  }, [isLineItemTaxMode, isTaxEnabled, normalizedLines, selectedTaxCode]);

  async function loadTransactions() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set("q", searchKeyword.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/sales/sales-order?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setTransactions(response.ok && data.ok && Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadNextSalesOrderDocNoPreview(nextDocDate = docDate) {
    const fallbackDocNo = buildSalesOrderDocNoPreview(nextDocDate, transactions);
    setAutoGeneratedDocNoPreview(fallbackDocNo);

    try {
      const params = new URLSearchParams({ nextDocNo: "1", docDate: nextDocDate });
      const response = await fetch(`/api/admin/sales/sales-order?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();

      if (response.ok && data?.ok && typeof data.docNo === "string" && data.docNo.trim()) {
        setAutoGeneratedDocNoPreview(data.docNo.trim());
      }
    } catch {
      setAutoGeneratedDocNoPreview(fallbackDocNo);
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    void openEditById(editId);
  }, [searchParams]);

  useEffect(() => {
    const sourceId = searchParams.get("sourceQuotationId");
    if (!sourceId) return;
    void openCreateFromQuotation(sourceId);
  }, [searchParams]);

  useEffect(() => {
    if (!isCreateOpen || docNo || formMode !== "create") return;
    void loadNextSalesOrderDocNoPreview(docDate);
  }, [docDate, isCreateOpen, docNo, formMode]);

  useEffect(() => {
    lines.forEach((line) => {
      if (!line.inventoryProductId || !line.locationId) return;
      const key = balanceKey(line.inventoryProductId, line.locationId);
      if (balances[key] !== undefined || loadingBalances[key]) return;

      setLoadingBalances((prev) => ({ ...prev, [key]: true }));
      fetch(`/api/admin/stock/balance?inventoryProductId=${encodeURIComponent(line.inventoryProductId)}&locationId=${encodeURIComponent(line.locationId)}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data: BalanceResponse) => {
          if (data?.ok && typeof data.balance === "number") {
            setBalances((prev) => ({ ...prev, [key]: Number(data.balance) }));
          }
        })
        .catch(() => null)
        .finally(() => {
          setLoadingBalances((prev) => ({ ...prev, [key]: false }));
        });
    });
  }, [balances, lines, loadingBalances]);

  function resetForm() {
    setActiveTab("HEADER");
    const nextDocDate = todayInput();
    setDocDate(nextDocDate);
    setAutoGeneratedDocNoPreview(buildSalesOrderDocNoPreview(nextDocDate, transactions));
    setDocNo("");
    setDocNoDraft("");
    setIsDocNoModalOpen(false);
    setDocDesc("");
    setCustomerId("");
    setCustomerAccountNo("");
    setCustomerName("");
    setBillingAddressLine1("");
    setBillingAddressLine2("");
    setBillingAddressLine3("");
    setBillingAddressLine4("");
    setBillingCity("");
    setBillingPostCode("");
    setBillingCountryCode("MY");
    setDeliveryAddressLine1("");
    setDeliveryAddressLine2("");
    setDeliveryAddressLine3("");
    setDeliveryAddressLine4("");
    setDeliveryCity("");
    setDeliveryPostCode("");
    setDeliveryCountryCode("MY");
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
    setSelectedTaxCodeId(taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : "");
    setLines([
      emptyLine(
        taxConfig.taxModuleEnabled && normalizeTaxCalculationMode(taxConfig.taxCalculationMode) === "LINE_ITEM" ? taxConfig.defaultAdminTaxCodeId || "" : "",
        defaultLocationId
      ),
    ]);
    setSubmitError("");
    setSubmitSuccess("");
    setGenerateFromError("");
  }

  function fillFormFromTransaction(transaction: SalesOrderRecord, mode: "edit" | "revise") {
    setFormMode(mode);
    setEditTarget(transaction);
    setActiveTab("HEADER");
    setDocDate(formatDateInput(transaction.docDate));
    setDocNo(mode === "edit" ? transaction.docNo : "");
    setDocNoDraft(mode === "edit" ? transaction.docNo : "");
    setAutoGeneratedDocNoPreview(mode === "revise" ? buildSalesOrderRevisionDocNoPreview(transaction) : transaction.docNo);
    setIsDocNoModalOpen(false);
    setDocDesc(transaction.docDesc || "");
    setCustomerId(transaction.customerId || "");
    setCustomerAccountNo(transaction.customerAccountNo || "");
    setCustomerName(transaction.customerName || "");
    setBillingAddressLine1(transaction.billingAddressLine1 || "");
    setBillingAddressLine2(transaction.billingAddressLine2 || "");
    setBillingAddressLine3(transaction.billingAddressLine3 || "");
    setBillingAddressLine4(transaction.billingAddressLine4 || "");
    setBillingCity(transaction.billingCity || "");
    setBillingPostCode(transaction.billingPostCode || "");
    setBillingCountryCode(transaction.billingCountryCode || "MY");
    setDeliveryAddressLine1(transaction.deliveryAddressLine1 || "");
    setDeliveryAddressLine2(transaction.deliveryAddressLine2 || "");
    setDeliveryAddressLine3(transaction.deliveryAddressLine3 || "");
    setDeliveryAddressLine4(transaction.deliveryAddressLine4 || "");
    setDeliveryCity(transaction.deliveryCity || "");
    setDeliveryPostCode(transaction.deliveryPostCode || "");
    setDeliveryCountryCode(transaction.deliveryCountryCode || "MY");
    setAttention(transaction.attention || "");
    setContactNo(transaction.contactNo || "");
    setEmail(transaction.email || "");
    setCurrency(transaction.currency || "MYR");
    setReference(transaction.reference || "");
    setRemarks(transaction.remarks || "");
    setAgentId(transaction.agentId || "");
    setProjectId(transaction.projectId || "");
    setDepartmentId(transaction.departmentId || "");
    setTermsAndConditions(transaction.termsAndConditions || "");
    setBankAccount(transaction.bankAccount || "");
    setFooterRemarks(transaction.footerRemarks || "");
    setSelectedTaxCodeId(transaction.taxCodeId || (taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : ""));
    setLines(
      Array.isArray(transaction.lines) && transaction.lines.length > 0
        ? transaction.lines.map((line) => ({
            inventoryProductId: line.inventoryProductId || "",
            productCode: line.productCode || "",
            productDescription: line.productDescription || "",
            uom: line.uom || "",
            qty: String(line.qty ?? "1"),
            unitPrice: String(line.unitPrice ?? "0.00"),
            discountRate: String(line.discountRate ?? "0"),
            discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
            locationId: line.locationId || defaultLocationId,
            taxRate: "0",
            taxCodeId: line.taxCodeId || "",
            remarks: line.remarks || "",
          }))
        : [emptyLine(taxConfig.taxModuleEnabled && normalizeTaxCalculationMode(taxConfig.taxCalculationMode) === "LINE_ITEM" ? taxConfig.defaultAdminTaxCodeId || "" : "", defaultLocationId)]
    );
    setSubmitError("");
    setSubmitSuccess("");
    setIsCreateOpen(true);
  }

  function openGenerateFromQuotation() {
    setGenerateFromError("");
    setSubmitError("");

    if (!customerId) {
      setGenerateFromError("Please select customer profile first before using Generate From.");
      setActiveTab("HEADER");
      return;
    }

    setSourceQuotationIds([]);
    setQuotationSearch("");
    setIsGenerateFromOpen(true);
  }

  function startGenerateFromQuotation() {
    void openCreate();
  }

  function toggleSourceQuotation(quotationId: string) {
    setSourceQuotationIds((prev) =>
      prev.includes(quotationId) ? prev.filter((id) => id !== quotationId) : [...prev, quotationId]
    );
  }

  function importSelectedQuotations() {
    if (!customerId) {
      setGenerateFromError("Please select customer profile first before using Generate From.");
      setIsGenerateFromOpen(false);
      setActiveTab("HEADER");
      return;
    }

    if (selectedSourceQuotations.length === 0) {
      setSubmitError("Please select at least one quotation.");
      return;
    }

    const first = selectedSourceQuotations[0];
    const hasDifferentCustomer = selectedSourceQuotations.some((quotation) => quotation.customerId !== first.customerId);
    if (hasDifferentCustomer) {
      setSubmitError("Selected quotations must belong to the same customer.");
      return;
    }

    setDocDate(todayInput());
    setDocNo("");
    setDocNoDraft("");
    setDocDesc(selectedSourceQuotations.length === 1 ? `Generated from ${first.docNo}` : `Generated from ${selectedSourceQuotations.length} quotations`);
    setCustomerId(first.customerId || "");
    setCustomerAccountNo(first.customerAccountNo || "");
    setCustomerName(first.customerName || "");
    setBillingAddressLine1(first.billingAddressLine1 || "");
    setBillingAddressLine2(first.billingAddressLine2 || "");
    setBillingAddressLine3(first.billingAddressLine3 || "");
    setBillingAddressLine4(first.billingAddressLine4 || "");
    setBillingCity(first.billingCity || "");
    setBillingPostCode(first.billingPostCode || "");
    setBillingCountryCode(first.billingCountryCode || "MY");
    setDeliveryAddressLine1(first.deliveryAddressLine1 || "");
    setDeliveryAddressLine2(first.deliveryAddressLine2 || "");
    setDeliveryAddressLine3(first.deliveryAddressLine3 || "");
    setDeliveryAddressLine4(first.deliveryAddressLine4 || "");
    setDeliveryCity(first.deliveryCity || "");
    setDeliveryPostCode(first.deliveryPostCode || "");
    setDeliveryCountryCode(first.deliveryCountryCode || "MY");
    setAttention(first.attention || "");
    setContactNo(first.contactNo || "");
    setEmail(first.email || "");
    setCurrency(first.currency || "MYR");
    setReference(selectedSourceQuotations.map((quotation) => quotation.docNo).join(", "));
    setRemarks(first.remarks || "");
    setAgentId(first.agentId || "");
    setProjectId(first.projectId || "");
    setDepartmentId(first.departmentId || "");
    setTermsAndConditions(first.termsAndConditions || "");
    setBankAccount(first.bankAccount || "");
    setFooterRemarks(first.footerRemarks || "");
    setSelectedTaxCodeId(first.taxCodeId || (taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : ""));

    const importedLines: LineForm[] = selectedSourceQuotations.flatMap((quotation) =>
      (quotation.lines || []).map((line): LineForm => ({
        inventoryProductId: line.inventoryProductId || "",
        productCode: line.productCode || "",
        productDescription: line.productDescription || "",
        uom: line.uom || "",
        qty: String(line.qty ?? "1"),
        unitPrice: String(line.unitPrice ?? "0.00"),
        discountRate: String(line.discountRate ?? "0"),
        discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
        locationId: line.locationId || defaultLocationId,
        taxRate: "0",
        taxCodeId: line.taxCodeId || "",
        remarks: line.remarks || "",
      }))
    );

    setLines(importedLines.length > 0 ? importedLines : [emptyLine(isLineItemTaxMode ? taxConfig.defaultAdminTaxCodeId || "" : "", defaultLocationId)]);
    setSourceQuotationId(selectedSourceQuotations.length === 1 ? first.id : "");
    setIsGenerateFromOpen(false);
    setGenerateFromError("");
    setActiveTab("BODY");
    setSubmitError("");
    setSubmitSuccess(`Imported ${selectedSourceQuotations.length} quotation(s). Please review and save the Sales Order.`);
  }

  async function openCreate() {
    setFormMode("create");
    setEditTarget(null);
    setSourceQuotationId("");
    setSourceQuotationIds([]);
    resetForm();
    setIsCreateOpen(true);
    await loadTransactions();
    await loadNextSalesOrderDocNoPreview(todayInput());
  }

  function openEdit(transaction: SalesOrderRecord) {
    fillFormFromTransaction(transaction, "edit");
  }

  function openRevise(transaction: SalesOrderRecord) {
    fillFormFromTransaction(transaction, "revise");
  }

  async function openCreateFromQuotation(transactionId: string) {
    setSubmitError("");
    try {
      const response = await fetch(`/api/admin/sales/quotation/${transactionId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.transaction) throw new Error(data.error || "Unable to load quotation.");
      const quotation = data.transaction as SalesOrderRecord;
      setFormMode("create");
      setEditTarget(null);
      setSourceQuotationId(transactionId);
      setSourceQuotationIds([transactionId]);
      fillFormFromTransaction(quotation, "edit");
      setFormMode("create");
      setEditTarget(null);
      setDocNo("");
      setDocNoDraft("");
      setAutoGeneratedDocNoPreview(buildSalesOrderDocNoPreview(formatDateInput(quotation.docDate), transactions));
      setSubmitSuccess(`Generating Sales Order from ${quotation.docNo}. Please review and save.`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to load quotation.");
    }
  }

  async function openEditById(transactionId: string) {
    setSubmitError("");
    try {
      const response = await fetch(`/api/admin/sales/sales-order/${transactionId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.transaction) throw new Error(data.error || "Unable to load sales order.");
      fillFormFromTransaction(data.transaction, "edit");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to load sales order.");
    }
  }

  function closeForm() {
    setIsCreateOpen(false);
    setEditTarget(null);
    setSourceQuotationId("");
    setSourceQuotationIds([]);
    setFormMode("create");
    setSubmitError("");
    setSubmitSuccess("");
    setGenerateFromError("");
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setSourceQuotationId("");
    setSourceQuotationIds([]);
    setGenerateFromError("");
    const customer = initialCustomers.find((item) => item.id === nextCustomerId);
    if (!customer) return;
    setCustomerAccountNo(customer.customerAccountNo || "");
    setCustomerName(customer.name || "");
    setBillingAddressLine1(customer.billingAddressLine1 || "");
    setBillingAddressLine2(customer.billingAddressLine2 || "");
    setBillingAddressLine3(customer.billingAddressLine3 || "");
    setBillingAddressLine4(customer.billingAddressLine4 || "");
    setBillingCity(customer.billingCity || "");
    setBillingPostCode(customer.billingPostCode || "");
    setBillingCountryCode(customer.billingCountryCode || "MY");
    setDeliveryAddressLine1(customer.deliveryAddressLine1 || "");
    setDeliveryAddressLine2(customer.deliveryAddressLine2 || "");
    setDeliveryAddressLine3(customer.deliveryAddressLine3 || "");
    setDeliveryAddressLine4(customer.deliveryAddressLine4 || "");
    setDeliveryCity(customer.deliveryCity || "");
    setDeliveryPostCode(customer.deliveryPostCode || "");
    setDeliveryCountryCode(customer.deliveryCountryCode || "MY");
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

  async function submitSalesOrder() {
    setSubmitError("");
    setSubmitSuccess("");
    setIsSubmitting(true);
    try {
      const payload = {
        docDate,
        docNo,
        docDesc,
        customerId,
        billingAddressLine1,
        billingAddressLine2,
        billingAddressLine3,
        billingAddressLine4,
        billingCity,
        billingPostCode,
        billingCountryCode,
        deliveryAddressLine1,
        deliveryAddressLine2,
        deliveryAddressLine3,
        deliveryAddressLine4,
        deliveryCity,
        deliveryPostCode,
        deliveryCountryCode,
        attention,
        contactNo,
        email,
        currency,
        reference,
        remarks,
        agentId,
        projectId,
        departmentId,
        termsAndConditions,
        bankAccount,
        footerRemarks,
        taxCalculationMode,
        sourceQuotationIds: formMode === "create" ? sourceQuotationIds : [],
        sourceQuotationId: formMode === "create" ? sourceQuotationId : "",
        transactionTaxCodeId: isTaxEnabled && !isLineItemTaxMode ? selectedTaxCodeId : "",
        lines: lines.map((line) => ({
          ...line,
          taxCodeId: isTaxEnabled && isLineItemTaxMode ? line.taxCodeId : "",
        })),
      };
      const isUpdateMode = formMode !== "create" && Boolean(editTarget?.id);
      const endpoint = isUpdateMode && editTarget ? `/api/admin/sales/sales-order/${editTarget.id}` : "/api/admin/sales/sales-order";
      const requestBody = isUpdateMode ? { ...payload, action: formMode === "revise" ? "revise" : "edit" } : payload;
      const response = await fetch(endpoint, {
        method: isUpdateMode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save sales order.");
      setSubmitSuccess(formMode === "revise" ? "Sales Order revised successfully." : formMode === "edit" ? "Sales Order updated successfully." : "Sales Order created successfully.");
      setIsCreateOpen(false);
      setEditTarget(null);
      setSourceQuotationId("");
      setSourceQuotationIds([]);
      setFormMode("create");
      await loadTransactions();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save sales order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const hasRevisionChildren = Array.isArray(item.revisions) && item.revisions.length > 0;
      return !hasRevisionChildren;
    });
  }, [transactions]);

  async function cancelSalesOrder() {
    if (!cancelTarget) return;
    try {
      const response = await fetch(`/api/admin/sales/sales-order/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", cancelReason }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to cancel sales order.");
      setCancelTarget(null);
      setCancelReason("");
      setSubmitSuccess("");
      await loadTransactions();
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to cancel sales order.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">Sales Order</h1>
          <p className="mt-4 max-w-3xl text-white/70">Create and manage sales order documents. Sales Order does not affect stock or sales figures.</p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Sales Order</p>
            <h2 className="mt-4 text-2xl font-bold">Existing Sales Order Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">
              Use Sales Order to prepare customer price offers before creating sales order, delivery order, or invoice.
            </p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
            Create Sales Order
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search sales order no / customer" />
            <CompactSelect options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading sales orders...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No sales order found.</td></tr>
              ) : (
                filteredTransactions.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/admin/sales/sales-order/${item.id}`)}
                    className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{item.docNo}</div>
                      {item.revisedFrom?.docNo ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (item.revisedFrom?.id) router.push(`/admin/sales/sales-order/${item.revisedFrom.id}`);
                          }}
                          className="mt-2 rounded-md px-1 py-0.5 text-left text-xs text-white/40 transition hover:bg-white/10 hover:text-white/80"
                        >
                          ↳ Revision of {item.revisedFrom.docNo}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">{formatDate(item.docDate)}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">{item.customerName}</div>
                      <div className="text-xs text-white/45">{item.customerAccountNo || "-"}</div>
                    </td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-4 text-right">{`${item.currency || "MYR"} ${money(Number(item.grandTotal || 0))}`}</td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== "CANCELLED" ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={(event) => { event.stopPropagation(); openEdit(item); }} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10">
                            Edit
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); openRevise(item); }} className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/10">
                            Edit Revise
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setCancelTarget(item); }} className="rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10">
                            Cancel
                          </button>
                        </div>
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
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Sales Order</p>
                <h2 className="mt-3 text-3xl font-bold">{formMode === "revise" ? "Revise Sales Order" : formMode === "edit" ? "Edit Sales Order" : "Create Sales Order"}</h2>
                {formMode === "create" && sourceQuotationIds.length > 0 ? (
                  <p className="mt-3 text-sm text-sky-200">
                    Generated from: {selectedSourceQuotations.map((quotation) => quotation.docNo).join(", ")}
                  </p>
                ) : null}
              </div>
              {formMode === "create" ? (
                <button
                  type="button"
                  onClick={openGenerateFromQuotation}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
                >
                  Generate From
                </button>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-red-600 text-white" : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"}`}
                >
                  {tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}
                </button>
              ))}
            </div>

            {generateFromError ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {generateFromError}
              </div>
            ) : null}

            {submitError ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}

            {submitSuccess ? (
              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {submitSuccess}
              </div>
            ) : null}

            {activeTab === "HEADER" ? (
              <div className="mt-6 space-y-6">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="label-rk">Doc Date</label>
                    <input className="input-rk" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                  </div>
                  <div className="xl:col-span-3">
                    <label className="label-rk">System Doc No</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (formMode === "create") openDocNoModal();
                      }}
                      className="input-rk flex w-full items-center justify-between gap-3 pr-6 text-left"
                    >
                      <span className="truncate text-white">{docNo || autoGeneratedDocNoPreview}</span>
                      <span className="shrink-0 text-xs text-white/50">{formMode === "create" ? "Click to override" : formMode === "revise" ? "Auto revision no" : "Locked"}</span>
                    </button>
                  </div>

                  <SearchableSelect
                    label="A/C No"
                    placeholder="Search or select customer"
                    options={customerOptions}
                    value={customerId}
                    onChange={(option) => handleCustomerChange(option?.id || "")}
                  />
                  <ReadonlyLike label="Customer Name" value={customerName} />
                  <ReadonlyLike label="Email" value={email} />

                  <div className="xl:col-span-2">
                    <label className="label-rk">Document Description</label>
                    <input className="input-rk" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} placeholder="Optional description" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <Input label="Attention" value={attention} onChange={setAttention} />
                  <Input label="Contact No" value={contactNo} onChange={setContactNo} />
                  <SearchableSelect
                    label="Agent"
                    placeholder="No Agent"
                    options={agentOptions}
                    value={agentId}
                    onChange={(option) => setAgentId(option?.id || "")}
                  />
                  {projectFeatureEnabled ? (
                    <SearchableSelect
                      label="Project"
                      placeholder="No Project"
                      options={projectOptions}
                      value={projectId}
                      onChange={(option) => {
                        setProjectId(option?.id || "");
                        setDepartmentId("");
                      }}
                    />
                  ) : null}
                  {departmentFeatureEnabled ? (
                    <SearchableSelect
                      label="Department"
                      placeholder={projectId ? "No Department" : "Select project first"}
                      options={departmentOptions}
                      value={departmentId}
                      disabled={!projectId}
                      onChange={(option) => setDepartmentId(option?.id || "")}
                    />
                  ) : null}
                </div>

                <AddressPanel title="Billing Address" values={[billingAddressLine1, billingAddressLine2, billingAddressLine3, billingAddressLine4, billingCity, billingPostCode, billingCountryCode]} setters={[setBillingAddressLine1, setBillingAddressLine2, setBillingAddressLine3, setBillingAddressLine4, setBillingCity, setBillingPostCode, setBillingCountryCode]} />

                <div>
                  <label className="label-rk">Remarks</label>
                  <textarea className="input-rk min-h-[90px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="mt-6 space-y-5">
                {lines.map((line, index) => {
                  const normalizedLine = normalizedLines[index];
                  const total = normalizedLine?.lineTotal || 0;
                  const taxAmount = normalizedLine?.taxAmount || 0;
                  const selectedProduct = initialProducts.find((item) => item.id === line.inventoryProductId) || null;
                  const uomOptions = getProductUomOptions(selectedProduct);
                  const trackingInfo = getProductTrackingInfo(selectedProduct);
                  return (
                    <div key={index} className="rounded-[1.75rem] border border-white/10 p-5">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-white">Product {index + 1}</h3>
                        {lines.length > 1 ? <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10">Remove</button> : null}
                      </div>
                      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <div className="md:col-span-2">
                          <SearchableSelect
                            label="Product"
                            placeholder="Search or select product"
                            options={productOptions}
                            value={line.inventoryProductId}
                            onChange={(option) => handleProductChange(index, option?.id || "")}
                          />
                          {trackingInfo ? <p className="mt-2 text-xs text-white/45">{trackingInfo}</p> : null}
                        </div>
                        <SearchableSelect
                          label="UOM"
                          placeholder="Select UOM"
                          options={uomOptions}
                          value={line.uom}
                          disabled={!selectedProduct}
                          onChange={(option) => updateLine(index, { uom: option?.id || selectedProduct?.baseUom || "" })}
                        />
                        <Input label="Qty" value={line.qty} onChange={(value) => updateLine(index, { qty: value })} />
                        <Input label="Selling Price" value={line.unitPrice} onChange={(value) => updateLine(index, { unitPrice: value })} />
                        <div>
                          <label className="label-rk">Discount</label>
                          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                            <input className="input-rk" value={line.discountRate} onChange={(e) => updateLine(index, { discountRate: e.target.value })} />
                            <CompactSelect
                              options={discountTypeOptions}
                              value={line.discountType}
                              onChange={(value) => updateLine(index, { discountType: value as "PERCENT" | "AMOUNT" })}
                            />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <SearchableSelect
                            label="Location"
                            placeholder="Search or select location"
                            options={locationOptions}
                            value={line.locationId}
                            onChange={(option) => updateLine(index, { locationId: option?.id || "" })}
                          />
                          <p className="mt-2 text-xs text-white/45">
                            {getBalanceDisplay(
                              line.inventoryProductId && line.locationId ? balances[balanceKey(line.inventoryProductId, line.locationId)] : undefined,
                              line.inventoryProductId && line.locationId ? Boolean(loadingBalances[balanceKey(line.inventoryProductId, line.locationId)]) : false
                            )}
                          </p>
                        </div>
                        {isLineItemTaxMode ? (
                          <SearchableSelect
                            label="Tax Code"
                            placeholder="No Tax"
                            options={taxCodeOptions}
                            value={line.taxCodeId}
                            onChange={(option) => updateLine(index, { taxCodeId: option?.id || "" })}
                          />
                        ) : null}
                        {isLineItemTaxMode ? <ReadonlyLike label="Tax Amount" value={money(taxAmount || 0)} /> : null}
                        <ReadonlyLike label="Gross Amount" value={money(total || 0)} />
                        <div className="md:col-span-2 xl:col-span-4">
                          <label className="label-rk">Product Remarks</label>
                          <textarea className="input-rk min-h-[80px]" value={line.remarks} onChange={(e) => updateLine(index, { remarks: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine(isLineItemTaxMode ? taxConfig.defaultAdminTaxCodeId || "" : "", defaultLocationId)])} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">+ Add Product</button>
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <div>
                    <label className="label-rk">Terms & Conditions</label>
                    <textarea className="input-rk min-h-[140px]" value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} placeholder="Enter terms manually. Template picker can be added in later phase." />
                  </div>
                  <div>
                    <label className="label-rk">Bank Account</label>
                    <textarea className="input-rk min-h-[100px]" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Enter bank details manually." />
                  </div>
                  <div>
                    <label className="label-rk">Footer Remarks</label>
                    <textarea className="input-rk min-h-[100px]" value={footerRemarks} onChange={(e) => setFooterRemarks(e.target.value)} />
                  </div>
                </div>
                <div className="h-fit rounded-[1.75rem] border border-white/10 bg-black/30 p-5 text-sm">
                  <h3 className="text-xl font-semibold text-white">Sales Order Summary</h3>
                  <SummaryRow label="Subtotal" value={money(totals.subtotal)} />
                  <SummaryRow label="Discount" value={money(totals.discountTotal)} />
                  {isTaxEnabled && !isLineItemTaxMode ? (
                    <div className="mt-4">
                      <SearchableSelect
                        label="Tax Code"
                        placeholder="No Tax"
                        options={taxCodeOptions}
                        value={selectedTaxCodeId}
                        onChange={(option) => setSelectedTaxCodeId(option?.id || "")}
                      />
                    </div>
                  ) : null}
                  {isTaxEnabled && isLineItemTaxMode ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/60">
                      Tax Code is controlled inside each product row. Sales Order Summary shows the combined tax amount from all rows.
                    </div>
                  ) : null}
                  {isTaxEnabled ? <SummaryRow label="Tax" value={money(totals.taxTotal)} /> : null}
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <SummaryRow label={`Grand Total (${currency || "MYR"})`} value={money(totals.grandTotal)} strong />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={closeForm} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              <button type="button" onClick={submitSalesOrder} disabled={isSubmitting} className="rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving..." : formMode === "revise" ? "Save Revised Sales Order" : formMode === "edit" ? "Update Sales Order" : "Save Sales Order"}
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {isGenerateFromOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">Generate From</p>
                <h3 className="mt-3 text-2xl font-bold">Select Quotation</h3>
                <p className="mt-3 text-sm leading-6 text-white/60">Select one or more pending quotations for the selected customer, then import them into this Sales Order.</p>
              </div>
              <button type="button" onClick={() => setIsGenerateFromOpen(false)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10">Close</button>
            </div>

            <div className="mt-5">
              <input className="input-rk" value={quotationSearch} onChange={(event) => setQuotationSearch(event.target.value)} placeholder="Search quotation no / customer" />
            </div>

            <div className="mt-5 max-h-[420px] overflow-y-auto rounded-2xl border border-white/10">
              {filteredSourceQuotations.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-white/50">No pending quotation found for this customer.</div>
              ) : (
                filteredSourceQuotations.map((quotation) => {
                  const checked = sourceQuotationIds.includes(quotation.id);
                  return (
                    <label key={quotation.id} className={`flex cursor-pointer items-center gap-4 border-b border-white/10 px-4 py-4 transition last:border-b-0 hover:bg-white/[0.04] ${checked ? "bg-sky-500/10" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSourceQuotation(quotation.id)}
                        className="h-4 w-4 rounded border-white/20 bg-black/40"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-white">{quotation.docNo}</span>
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">{quotation.status}</span>
                        </div>
                        <div className="mt-1 text-sm text-white/70">{quotation.customerName}</div>
                        <div className="mt-1 text-xs text-white/45">{quotation.customerAccountNo || "-"} • {formatDate(quotation.docDate)} • {quotation.currency || "MYR"} {money(Number(quotation.grandTotal || 0))}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/55">{sourceQuotationIds.length} quotation(s) selected</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setSourceQuotationIds([])} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10">Clear</button>
                <button type="button" onClick={importSelectedQuotations} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400">Import Selected</button>
              </div>
            </div>
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
                <div className="input-rk flex items-center text-white">{autoGeneratedDocNoPreview}</div>
              </div>
              <div>
                <label className="label-rk">Custom Document No</label>
                <input
                  className="input-rk"
                  value={docNoDraft}
                  onChange={(e) => setDocNoDraft(normalizeDocNoInput(e.target.value))}
                  placeholder="Enter custom document no"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDocNoModalOpen(false)} className="rounded-xl border border-white/15 px-4 py-3 text-white/75 transition hover:bg-white/10">Cancel</button>
              <button type="button" onClick={saveDocNoOverride} className="rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">OK</button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <h3 className="text-2xl font-bold text-white">Cancel Sales Order</h3>
            <p className="mt-3 text-sm text-white/60">Please enter a reason to cancel {cancelTarget.docNo}.</p>
            <textarea className="input-rk mt-5 min-h-[120px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Cancellation reason" />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelTarget(null)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              <button type="button" onClick={cancelSalesOrder} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400">Confirm Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ReadonlyLike({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value || ""} readOnly disabled />
    </div>
  );
}

function AddressPanel({
  title,
  values,
  setters,
  showCountry = false,
}: {
  title: string;
  values: string[];
  setters: Array<(value: string) => void>;
  showCountry?: boolean;
}) {
  const labels = ["Address Line 1", "Address Line 2", "Address Line 3", "Address Line 4", "City", "Post Code", "Country"];
  const visibleValues = showCountry ? values : values.slice(0, 6);
  const visibleSetters = showCountry ? setters : setters.slice(0, 6);

  return (
    <div className="rounded-[1.75rem] border border-white/10 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {visibleValues.map((value, index) => (
          <Input key={labels[index]} label={labels[index]} value={value} onChange={visibleSetters[index]} />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`mt-4 flex items-center justify-between gap-4 ${strong ? "text-lg font-bold text-white" : "text-white/75"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
