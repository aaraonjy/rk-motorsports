"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  normalizeTaxCalculationMode,
  roundMoney,
  type TaxCalculationMethodValue,
  type TaxCalculationModeValue,
} from "@/lib/tax";

type SupplierOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  supplierAccountNo?: string | null;
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
  unitCost: number;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
  uomConversions?: ProductUomConversionOption[];
};

type SimpleOption = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  projectId?: string;
};

type TaxCodeOption = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: TaxCalculationMethodValue;
};

type PurchaseTransactionRecord = {
  id: string;
  docNo: string;
  docType?: "PO" | "GRN" | "PI" | string | null;
  docDate: string;
  docDesc?: string | null;
  supplierId?: string | null;
  supplierName: string;
  supplierAccountNo?: string | null;
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
  status: "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED" | string;
  grandTotal: string | number;
  revisedFrom?: { id: string; docNo?: string | null } | null;
  revisions?: Array<{
    id: string;
    docNo?: string | null;
    status?: string | null;
  }>;
  sourceLinks?: Array<{
    targetTransaction?: {
      id: string;
      docType?: string | null;
      docNo?: string | null;
      status?: string | null;
      revisions?: Array<{ id?: string | null; status?: string | null } | null>;
    } | null;
  }>;
  targetLinks?: Array<{
    sourceTransaction?: {
      id: string;
      docType?: string | null;
      docNo?: string | null;
      status?: string | null;
    } | null;
  }>;
  lines?: Array<{
    id?: string;
    inventoryProductId?: string | null;
    productCode?: string | null;
    productDescription?: string | null;
    itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
    uom?: string | null;
    qty?: string | number | null;
    remainingQty?: string | number | null;
    remainingReceiveQty?: string | number | null;
    remainingInvoiceQty?: string | number | null;
    unitCost?: string | number | null;
    discountRate?: string | number | null;
    discountType?: string | null;
    locationId?: string | null;
    batchNo?: string | null;
    expiryDate?: string | Date | null;
    serialNos?: string[] | null;
    taxCodeId?: string | null;
    remarks?: string | null;
  }>;
};

type StockNumberFormatConfig = {
  qtyDecimalPlaces: number;
  unitCostDecimalPlaces: number;
  priceDecimalPlaces: number;
};

type Props = {
  initialTransactions: PurchaseTransactionRecord[];
  sourceDocuments: PurchaseTransactionRecord[];
  initialSuppliers: SupplierOption[];
  initialProducts: ProductOption[];
  initialAgents: SimpleOption[];
  initialProjects: SimpleOption[];
  initialDepartments: SimpleOption[];
  initialLocations: SimpleOption[];
  defaultLocationId: string;
  projectFeatureEnabled: boolean;
  departmentFeatureEnabled: boolean;
  stockNumberFormat: StockNumberFormatConfig;
  taxConfig: {
    taxModuleEnabled: boolean;
    taxCalculationMode: TaxCalculationModeValue;
    defaultAdminTaxCodeId?: string | null;
    taxCodes: TaxCodeOption[];
  };
};

type LineForm = {
  sourceLineId: string;
  sourceTransactionId: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  uom: string;
  qty: string;
  unitCost: string;
  discountRate: string;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  batchNo: string;
  batchMode: "existing" | "new";
  expiryDate: string;
  serialNos: string[];
  serialSearch: string;
  serialEntryText: string;
  taxCodeId: string;
  remarks: string;
};

type ActiveTab = "HEADER" | "BODY" | "FOOTER";
type PurchaseSourceDocumentType = "PI" | "CP";

const DOC_TYPE = "PR";
const TITLE = "Purchase Return";
const SUBTITLE =
  "Return goods to supplier. Stocks out and reduces purchase amount.";
const API_PATH = "/api/admin/purchase/purchase-return";
const SOURCE_MODAL_TITLE = "Pick From Purchase Document";
const SOURCE_MODAL_DESCRIPTION =
  "Only Purchase Invoices or Cash Purchases with remaining return qty are shown.";
const DETAIL_PATH = "/admin/purchase/purchase-return";
const SELECT_RK = "input-rk appearance-none pr-12";
const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' fill=\'none\'%3E%3Cpath d=\'M5 7.5L10 12.5L15 7.5\' stroke=\'%239CA3AF\' stroke-width=\'1.8\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")`,
  backgroundPosition: "right 1.25rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "1rem 1rem",
} as const;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-MY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
}
function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date
    .toLocaleString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/am|pm/i, (value) => value.toLowerCase());
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
function formatBatchExpiryDate(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
}

function getDecimalPlaces(value: unknown, fallback = 2) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(6, Math.trunc(numeric)));
}
function formatDecimalInput(value: unknown, decimalPlaces: number) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return (0).toFixed(decimalPlaces);
  return numeric.toFixed(decimalPlaces);
}
function uniqueSerialNos(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
  }
  return next;
}
function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}
function getNextAutoDocNo(
  docType: string,
  docDate: string,
  transactions: PurchaseTransactionRecord[],
) {
  const compact = (docDate || todayInput()).replace(/-/g, "");
  const pattern = new RegExp(`^${docType}-${compact}-(\\d{4})(?:-\\d+)?$`);
  let maxRunningNo = 0;
  for (const transaction of transactions) {
    const match = String(transaction.docNo || "").match(pattern);
    if (!match) continue;
    const runningNo = Number(match[1]);
    if (Number.isFinite(runningNo))
      maxRunningNo = Math.max(maxRunningNo, runningNo);
  }
  return `${docType}-${compact}-${String(maxRunningNo + 1).padStart(4, "0")}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getRevisionBaseDocNo(docNo: string) {
  const match = String(docNo || "").match(/^(.+-\d{4})(?:-\d+)?$/);
  return match ? match[1] : String(docNo || "");
}
function getNextRevisionDocNo(
  originalDocNo: string,
  transactions: PurchaseTransactionRecord[],
) {
  const baseDocNo = getRevisionBaseDocNo(originalDocNo);
  if (!baseDocNo) return "";
  const pattern = new RegExp(`^${escapeRegExp(baseDocNo)}-(\\d+)$`);
  let maxRevisionNo = 0;
  for (const transaction of transactions) {
    const currentDocNo = String(transaction.docNo || "");
    const match = currentDocNo.match(pattern);
    if (!match) continue;
    const revisionNo = Number(match[1]);
    if (Number.isFinite(revisionNo)) {
      maxRevisionNo = Math.max(maxRevisionNo, revisionNo);
    }
  }
  return `${baseDocNo}-${maxRevisionNo + 1}`;
}

function lineAmount(line: LineForm) {
  const qty = Math.max(0, Number(line.qty || 0));
  const unitCost = Math.max(0, Number(line.unitCost || 0));
  const subtotal = roundMoney(qty * unitCost);
  const discountRate = Math.max(0, Number(line.discountRate || 0));
  const discount =
    line.discountType === "AMOUNT"
      ? discountRate
      : roundMoney(subtotal * (discountRate / 100));
  return Math.max(0, roundMoney(subtotal - discount));
}
function emptyLine(
  defaultLocationId = "",
  defaultTaxCodeId = "",
  qtyDecimalPlaces = 2,
  unitCostDecimalPlaces = 2,
): LineForm {
  return {
    sourceLineId: "",
    sourceTransactionId: "",
    inventoryProductId: "",
    productCode: "",
    productDescription: "",
    itemType: "STOCK_ITEM",
    uom: "",
    qty: formatDecimalInput(1, qtyDecimalPlaces),
    unitCost: formatDecimalInput(0, unitCostDecimalPlaces),
    discountRate: "0",
    discountType: "PERCENT",
    locationId: defaultLocationId,
    batchNo: "",
    batchMode: "existing",
    expiryDate: "",
    serialNos: [],
    serialSearch: "",
    serialEntryText: "",
    taxCodeId: defaultTaxCodeId,
    remarks: "",
  };
}
type BalanceResponse = { ok?: boolean; balance?: number; balances?: Array<{ batchNo?: string | null; balance?: number | null; expiryDate?: string | null }>; error?: string };
type SerialNoResponse = { ok?: boolean; items?: Array<{ id?: string; serialNo?: string | null }>; error?: string };

type AvailableBatch = {
  id: string;
  batchNo: string;
  expiryDate?: string | null;
  balance?: number | null;
};
function balanceKey(productId: string, locationId: string, batchNo = "") {
  return `${productId}__${locationId}__${batchNo || ""}`;
}
function serialAvailabilityKey(productId: string, locationId: string, batchNo = "") {
  return `${productId}__${locationId}__${String(batchNo || "").trim().toUpperCase()}`;
}
function formatQtyBalance(
  value: number | undefined,
  isLoading: boolean,
  qtyDecimalPlaces: number,
) {
  if (isLoading) return "Loading balance...";
  if (typeof value !== "number")
    return "Select product and location to view balance.";
  return `Qty Balance: ${value.toLocaleString("en-MY", { minimumFractionDigits: qtyDecimalPlaces, maximumFractionDigits: qtyDecimalPlaces })}`;
}
function formatSerialAvailability(
  value: number | undefined,
  isLoading: boolean,
  qtyDecimalPlaces: number,
) {
  if (isLoading) return "Loading serial availability...";
  if (typeof value !== "number") return "Select product and location to view serial availability.";
  return `Qty Balance: ${value.toLocaleString("en-MY", { minimumFractionDigits: qtyDecimalPlaces, maximumFractionDigits: qtyDecimalPlaces })} (${value.toLocaleString("en-MY")} Serial No${value === 1 ? "" : "s"} Available)`;
}
function isActiveLinkedTransaction(transaction: {
  status?: string | null;
  revisions?: Array<{ status?: string | null } | null> | null;
} | null | undefined) {
  if (!transaction) return false;
  if (String(transaction.status || "").toUpperCase() === "CANCELLED") return false;
  return (transaction.revisions || []).length === 0;
}

function statusClass(status: string) {
  if (status === "CANCELLED")
    return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "COMPLETED")
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (status === "PARTIAL")
    return "border-indigo-500/25 bg-indigo-500/10 text-indigo-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
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

  const selectedOption = useMemo(
    () => options.find((item) => item.id === value) || null,
    [options, value],
  );

  useEffect(() => {
    setSearch(selectedOption?.label || "");
  }, [selectedOption?.label]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
        <span
          className={
            selectedOption ? "truncate text-white" : "truncate text-white/45"
          }
        >
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
              <div className="rounded-xl px-3 py-3 text-sm text-white/45">
                No matching {label.toLowerCase()} found.
              </div>
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
                    className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${isSelected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
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
  disabled = false,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(
    () => options.find((item) => item.id === value) || null,
    [options, value],
  );

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        className={`input-rk flex items-center justify-between gap-3 pr-20 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span
          className={
            selectedOption ? "truncate text-white" : "truncate text-white/45"
          }
        >
          {selectedOption?.label || ""}
        </span>
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
                className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${isSelected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
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

function getProductUomOptions(product: ProductOption | null | undefined) {
  if (!product) return [];
  const seen = new Set<string>();
  const result: Array<{ id: string; label: string }> = [];
  const add = (uomCode: string, label: string) => {
    const normalized = String(uomCode || "")
      .trim()
      .toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push({ id: normalized, label });
  };
  add(product.baseUom, `${product.baseUom} (Base UOM)`);
  for (const item of product.uomConversions || []) {
    if (Number(item.conversionRate) > 0)
      add(
        item.uomCode,
        `${item.uomCode} (1 = ${item.conversionRate} ${product.baseUom})`,
      );
  }
  return result;
}

export function AdminPurchaseReturnClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qtyDecimalPlaces = getDecimalPlaces(
    props.stockNumberFormat.qtyDecimalPlaces,
    2,
  );
  const unitCostDecimalPlaces = getDecimalPlaces(
    props.stockNumberFormat.unitCostDecimalPlaces,
    2,
  );
  const taxMode = normalizeTaxCalculationMode(
    props.taxConfig.taxCalculationMode,
  );
  const defaultTaxCodeId = "";
  const editId = searchParams.get("edit");
  const reviseId = searchParams.get("revise");
  const sourceId = searchParams.get("source");
  const editingTransaction =
    props.initialTransactions.find((item) => item.id === editId) || null;
  const reviseTransaction =
    props.initialTransactions.find((item) => item.id === reviseId) || null;
  const sourceTransaction =
    props.sourceDocuments.find((item) => item.id === sourceId) || null;
  const isRevisionMode = Boolean(reviseTransaction && !editingTransaction);
  const isGeneratedFromSource = Boolean(
    sourceTransaction && !editingTransaction && !isRevisionMode,
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("HEADER");
  const [docNo, setDocNo] = useState("");
  const [manualDocNoEnabled, setManualDocNoEnabled] = useState(false);
  const [form, setForm] = useState({
    docDate: todayInput(),
    docDesc: "",
    supplierId: "",
    supplierName: "",
    supplierAccountNo: "",
    contactNo: "",
    email: "",
    currency: "MYR",
    reference: "",
    remarks: "",
    attention: "",
    agentId: "",
    projectId: "",
    departmentId: "",
    taxCodeId: "",
    termsAndConditions: "",
    bankAccount: "",
    footerRemarks: "",
  });
  const [lines, setLines] = useState<LineForm[]>([
    emptyLine(
      props.defaultLocationId,
      defaultTaxCodeId,
      qtyDecimalPlaces,
      unitCostDecimalPlaces,
    ),
  ]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGenerateFrom, setShowGenerateFrom] = useState(false);
  const [isGenerateFromOpen, setIsGenerateFromOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedSourceType, setSelectedSourceType] =
    useState<PurchaseSourceDocumentType | null>(null);
  const [sourceProductsLoaded, setSourceProductsLoaded] = useState(false);
  const [sourceLineQty, setSourceLineQty] = useState<Record<string, string>>(
    {},
  );
  const [generatedSourceLabel, setGeneratedSourceLabel] = useState("");
  const activeGeneratedFromDocs = useMemo(
    () =>
      (editingTransaction || reviseTransaction)?.targetLinks
        ?.map((link) => link.sourceTransaction)
        .filter(
          (source): source is NonNullable<typeof source> =>
            Boolean(source?.docNo) && source?.status !== "CANCELLED",
        ) || [],
    [editingTransaction, reviseTransaction],
  );
  const activeGeneratedFromLabel = activeGeneratedFromDocs
    .map((source) => String(source.docNo))
    .filter(Boolean)
    .join(", ");
  const isBodyLocked = Boolean(
    isGeneratedFromSource || generatedSourceLabel || activeGeneratedFromLabel,
  );
  const bodyLockSourceLabel =
    generatedSourceLabel || activeGeneratedFromLabel || sourceTransaction?.docNo || "source document";
  const [generateFromError, setGenerateFromError] = useState("");
  const [cancelTarget, setCancelTarget] =
    useState<PurchaseTransactionRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotice, setCancelNotice] = useState<{
    docNo: string;
    cancelledAt: Date;
    reason: string;
    cancelledByName?: string;
  } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(
    Boolean(editId || reviseId || sourceId),
  );
  const [showDocNoOverride, setShowDocNoOverride] = useState(false);
  const [docNoDraft, setDocNoDraft] = useState("");
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState<
    Record<string, boolean>
  >({});
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [availableBatches, setAvailableBatches] = useState<Record<number, AvailableBatch[]>>({});
  const [loadingBatches, setLoadingBatches] = useState<Record<number, boolean>>({});
  const [serialAvailabilityCounts, setSerialAvailabilityCounts] = useState<Record<string, number>>({});
  const [loadingSerialAvailability, setLoadingSerialAvailability] = useState<Record<string, boolean>>({});


  useEffect(() => {
    let cancelled = false;
    lines.forEach((line, index) => {
      const product = props.initialProducts.find((item) => item.id === line.inventoryProductId);
      if (!product?.batchTracking || !line.inventoryProductId || !line.locationId) {
        setAvailableBatches((prev) => ({ ...prev, [index]: [] }));
        return;
      }

      setLoadingBatches((prev) => ({ ...prev, [index]: true }));
      const params = new URLSearchParams();
      params.set("inventoryProductId", line.inventoryProductId);
      params.set("locationId", line.locationId);

      fetch(`/api/admin/stock/balance?${params.toString()}`, { cache: "no-store" })
        .then((res) => res.json() as Promise<BalanceResponse>)
        .then((data) => {
          if (cancelled) return;
          const rows = Array.isArray(data.balances) ? data.balances : [];
          const batches: AvailableBatch[] = rows
            .filter((row) => row.batchNo)
            .map((row) => ({
              id: String(row.batchNo || ""),
              batchNo: String(row.batchNo || ""),
              expiryDate: row.expiryDate || null,
              balance: typeof row.balance === "number" ? row.balance : Number(row.balance || 0),
            }))
            .filter((row) => row.batchNo);

          const selectedBatchNo = String(line.batchNo || "").trim();
          if (selectedBatchNo && !batches.some((batch) => batch.batchNo.toUpperCase() === selectedBatchNo.toUpperCase())) {
            batches.unshift({
              id: selectedBatchNo,
              batchNo: selectedBatchNo,
              expiryDate: line.expiryDate || null,
              balance: null,
            });
          }

          setAvailableBatches((prev) => ({ ...prev, [index]: batches }));
        })
        .catch(() => {
          if (!cancelled) setAvailableBatches((prev) => ({ ...prev, [index]: [] }));
        })
        .finally(() => {
          if (!cancelled) setLoadingBatches((prev) => ({ ...prev, [index]: false }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [lines, props.initialProducts, balanceRefreshKey]);

  function refreshStockBalances() {
    setBalances({});
    setLoadingBalances({});
    setSerialAvailabilityCounts({});
    setLoadingSerialAvailability({});
    setBalanceRefreshKey((prev) => prev + 1);
  }

  const [listingStatus, setListingStatus] = useState("ALL");

  const statusOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "ALL", label: "All Status", searchText: "all status" },
      { id: "OPEN", label: "Open", searchText: "open" },
      { id: "PARTIAL", label: "Partial", searchText: "partial" },
      { id: "COMPLETED", label: "Completed", searchText: "completed" },
      { id: "CANCELLED", label: "Cancelled", searchText: "cancelled" },
    ],
    [],
  );

  const discountTypeOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "PERCENT", label: "%", searchText: "% percent" },
      {
        id: "AMOUNT",
        label: form.currency || "MYR",
        searchText: "amount currency",
      },
    ],
    [form.currency],
  );

  const supplierOptions = useMemo<SearchableSelectOption[]>(
    () =>
      props.initialSuppliers.map((supplier) => {
        const label = `${supplier.supplierAccountNo ? `${supplier.supplierAccountNo} — ` : ""}${supplier.name}`;
        return {
          id: supplier.id,
          label,
          searchText:
            `${label} ${supplier.email || ""} ${supplier.phone || ""}`.toLowerCase(),
        };
      }),
    [props.initialSuppliers],
  );

  const agentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Agent", searchText: "no agent" },
      ...props.initialAgents.map((item) => ({
        id: item.id,
        label: `${item.code} — ${item.name}`,
        searchText: `${item.code} ${item.name}`.toLowerCase(),
      })),
    ],
    [props.initialAgents],
  );

  const projectOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Project", searchText: "no project" },
      ...props.initialProjects.map((item) => ({
        id: item.id,
        label: `${item.code} — ${item.name}`,
        searchText: `${item.code} ${item.name}`.toLowerCase(),
      })),
    ],
    [props.initialProjects],
  );

  const departmentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        id: "",
        label: form.projectId ? "No Department" : "Select project first",
        searchText: "no department select project first",
      },
      ...props.initialDepartments
        .filter((item) => !form.projectId || item.projectId === form.projectId)
        .map((item) => ({
          id: item.id,
          label: `${item.code} — ${item.name}`,
          searchText: `${item.code} ${item.name}`.toLowerCase(),
        })),
    ],
    [props.initialDepartments, form.projectId],
  );

  const productOptions = useMemo<SearchableSelectOption[]>(
    () =>
      props.initialProducts.map((item) => ({
        id: item.id,
        label: `${item.code} — ${item.description}`,
        searchText: `${item.code} ${item.description}`.toLowerCase(),
      })),
    [props.initialProducts],
  );

  const locationOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Location", searchText: "no location" },
      ...props.initialLocations.map((item) => ({
        id: item.id,
        label: `${item.code} — ${item.name}`,
        searchText: `${item.code} ${item.name}`.toLowerCase(),
      })),
    ],
    [props.initialLocations],
  );

  const taxCodeOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Tax", searchText: "no tax" },
      ...props.taxConfig.taxCodes.map((tax) => ({
        id: tax.id,
        label: tax.code,
        searchText: `${tax.code} ${tax.description}`.toLowerCase(),
      })),
    ],
    [props.taxConfig.taxCodes],
  );

  const sourceDocumentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "Direct Create", searchText: "direct create" },
      ...props.sourceDocuments.map((source) => ({
        id: source.id,
        label: `${source.docNo} — ${source.supplierName} (${source.docType})`,
        searchText:
          `${source.docNo} ${source.supplierName} ${source.docType}`.toLowerCase(),
      })),
    ],
    [props.sourceDocuments],
  );

  const selectedSourceTypeLabel =
    selectedSourceType === "PI"
      ? "Purchase Invoice"
      : selectedSourceType === "CP"
        ? "Cash Purchase"
        : "Document Source";

  const filteredSourceDocuments = useMemo(() => {
    const keyword = sourceSearch.trim().toLowerCase();
    return props.sourceDocuments.filter((source) => {
      const sourceType = String(source.docType || source.docNo || "")
        .toUpperCase()
        .replace(/[^A-Z].*$/, "");
      if (selectedSourceType && sourceType !== selectedSourceType) return false;
      if (
        form.supplierId &&
        source.supplierId &&
        source.supplierId !== form.supplierId
      )
        return false;
      if (!keyword) return true;
      return `${source.docNo} ${source.supplierName} ${source.supplierAccountNo || ""}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [props.sourceDocuments, sourceSearch, form.supplierId, selectedSourceType]);

  const visibleTransactions = useMemo(
    () =>
      props.initialTransactions.filter((item) => {
        if ((item.revisions || []).length > 0) return false;
        if (listingStatus !== "ALL" && item.status !== listingStatus)
          return false;
        return true;
      }),
    [props.initialTransactions, listingStatus],
  );

  useEffect(() => {
    const source = editingTransaction || reviseTransaction || sourceTransaction;
    if (!source) return;
    setDocNo(editingTransaction?.docNo || "");
    setManualDocNoEnabled(false);
    setForm({
      docDate: editingTransaction
        ? formatDateInput(source.docDate)
        : todayInput(),
      docDesc: source.docDesc || "",
      supplierId: source.supplierId || "",
      supplierName: source.supplierName || "",
      supplierAccountNo: source.supplierAccountNo || "",
      contactNo: source.contactNo || "",
      email: source.email || "",
      currency: source.currency || "MYR",
      reference: editingTransaction
        ? source.reference || ""
        : isRevisionMode
          ? source.reference || ""
          : source.docNo || "",
      remarks: source.remarks || "",
      attention: source.attention || "",
      agentId: source.agentId || "",
      projectId: source.projectId || "",
      departmentId: source.departmentId || "",
      taxCodeId: source.taxCodeId || "",
      termsAndConditions: source.termsAndConditions || "",
      bankAccount: source.bankAccount || "",
      footerRemarks: source.footerRemarks || "",
    });
    setLines(
      (source.lines || []).map((line) => ({
        sourceLineId: editingTransaction || isRevisionMode ? "" : line.id || "",
        sourceTransactionId:
          editingTransaction || isRevisionMode ? "" : source.id,
        inventoryProductId: line.inventoryProductId || "",
        productCode: line.productCode || "",
        productDescription: line.productDescription || "",
        itemType: line.itemType || "STOCK_ITEM",
        uom: line.uom || "",
        qty: formatDecimalInput(
          (line as any).remainingQty ??
            (line as any).remainingInvoiceQty ??
            (line as any).remainingReceiveQty ??
            line.qty ??
            1,
          qtyDecimalPlaces,
        ),
        unitCost: formatDecimalInput(line.unitCost ?? 0, unitCostDecimalPlaces),
        discountRate: formatDecimalInput(line.discountRate ?? 0, 2),
        discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
        locationId: line.locationId || props.defaultLocationId,
        batchNo: line.batchNo || "",
        batchMode: line.batchNo ? "existing" : "existing",
        expiryDate: (line as any).expiryDate ? formatDateInput((line as any).expiryDate) : "",
        serialNos: Array.isArray(line.serialNos) ? line.serialNos : [],
        serialSearch: "",
        serialEntryText: "",
        taxCodeId: "",
        remarks: line.remarks || "",
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, reviseId, sourceId]);

  useEffect(() => {
    if (editId || reviseId || sourceId) {
      setIsCreateOpen(true);
    }
  }, [editId, reviseId, sourceId]);

  useEffect(() => {
    for (const line of lines) {
      if (!line.inventoryProductId || !line.locationId) continue;
      const product = props.initialProducts.find(
        (item) => item.id === line.inventoryProductId,
      );
      if (product?.serialNumberTracking) continue;
      const batchNo = product?.batchTracking ? line.batchNo : "";
      if (product?.batchTracking && !batchNo) continue;
      const key = balanceKey(line.inventoryProductId, line.locationId, batchNo);
      if (balances[key] !== undefined || loadingBalances[key]) continue;
      setLoadingBalances((prev) => ({ ...prev, [key]: true }));
      const params = new URLSearchParams({
        inventoryProductId: line.inventoryProductId,
        locationId: line.locationId,
      });
      if (batchNo) params.set("batchNo", batchNo);
      params.set("_ts", `${Date.now()}-${balanceRefreshKey}`);
      fetch(`/api/admin/stock/balance?${params.toString()}`, {
        cache: "no-store",
      })
        .then((response) => response.json() as Promise<BalanceResponse>)
        .then((data) => {
          if (data?.ok && typeof data.balance === "number") {
            setBalances((prev) => ({ ...prev, [key]: Number(data.balance) }));
          }
        })
        .finally(() =>
          setLoadingBalances((prev) => ({ ...prev, [key]: false })),
        );
    }
  }, [balances, props.initialProducts, lines, loadingBalances, balanceRefreshKey]);

  useEffect(() => {
    for (const line of lines) {
      if (!line.inventoryProductId || !line.locationId) continue;
      const product = props.initialProducts.find(
        (item) => item.id === line.inventoryProductId,
      );
      if (!product?.serialNumberTracking) continue;
      const batchNo = product.batchTracking ? line.batchNo : "";
      if (product.batchTracking && !batchNo) continue;
      const key = serialAvailabilityKey(line.inventoryProductId, line.locationId, batchNo);
      if (serialAvailabilityCounts[key] !== undefined || loadingSerialAvailability[key]) continue;
      setLoadingSerialAvailability((prev) => ({ ...prev, [key]: true }));
      const params = new URLSearchParams({
        productId: line.inventoryProductId,
        locationId: line.locationId,
        status: "IN_STOCK",
      });
      if (batchNo) params.set("batchNo", batchNo);
      params.set("_ts", `${Date.now()}-${balanceRefreshKey}`);
      fetch(`/api/admin/stock/serial-no?${params.toString()}`, {
        cache: "no-store",
      })
        .then((response) => response.json() as Promise<SerialNoResponse>)
        .then((data) => {
          if (data?.ok && Array.isArray(data.items)) {
            setSerialAvailabilityCounts((prev) => ({ ...prev, [key]: data.items?.length || 0 }));
          }
        })
        .finally(() =>
          setLoadingSerialAvailability((prev) => ({ ...prev, [key]: false })),
        );
    }
  }, [serialAvailabilityCounts, props.initialProducts, lines, loadingSerialAvailability, balanceRefreshKey]);

  const headerTaxCode =
    props.taxConfig.taxCodes.find((item) => item.id === form.taxCodeId) || null;
  const totals = useMemo(() => {
    const mapped = lines.map((line) => {
      const subtotal = roundMoney(
        Number(line.qty || 0) * Number(line.unitCost || 0),
      );
      const discountRate = Number(line.discountRate || 0);
      const discount =
        line.discountType === "AMOUNT"
          ? discountRate
          : roundMoney(subtotal * (discountRate / 100));
      const total = Math.max(0, roundMoney(subtotal - discount));
      const lineTaxCode =
        props.taxConfig.taxCodes.find((item) => item.id === line.taxCodeId) ||
        null;
      const tax = calculateLineItemTaxBreakdown({
        lineTotal: total,
        taxRate: lineTaxCode?.rate || 0,
        calculationMethod: lineTaxCode?.calculationMethod || null,
        taxEnabled: props.taxConfig.taxModuleEnabled && Boolean(lineTaxCode),
      });
      return {
        subtotal,
        discount,
        tax: tax.taxAmount,
        total: tax.lineGrandTotalAfterTax,
      };
    });
    const subtotal = roundMoney(
      mapped.reduce((sum, item) => sum + item.subtotal, 0),
    );
    const discount = roundMoney(
      mapped.reduce((sum, item) => sum + item.discount, 0),
    );
    if (taxMode === "LINE_ITEM")
      return {
        subtotal,
        discount,
        tax: roundMoney(mapped.reduce((sum, item) => sum + item.tax, 0)),
        grandTotal: roundMoney(
          mapped.reduce((sum, item) => sum + item.total, 0),
        ),
      };
    const tax = calculateTaxBreakdown({
      subtotal,
      discount,
      taxRate: headerTaxCode?.rate || 0,
      calculationMethod: headerTaxCode?.calculationMethod || null,
      taxEnabled: props.taxConfig.taxModuleEnabled && Boolean(headerTaxCode),
    });
    return {
      subtotal,
      discount,
      tax: tax.taxAmount,
      grandTotal: tax.grandTotalAfterTax,
    };
  }, [lines, props.taxConfig, taxMode, headerTaxCode]);

  const autoDocNoPreview = getNextAutoDocNo(
    DOC_TYPE,
    form.docDate,
    props.initialTransactions,
  );
  const revisionDocNoPreview = reviseTransaction
    ? getNextRevisionDocNo(reviseTransaction.docNo, props.initialTransactions)
    : "";
  const docNoPreview =
    editingTransaction?.docNo ||
    (isRevisionMode
      ? revisionDocNoPreview
      : manualDocNoEnabled
        ? docNo
        : autoDocNoPreview);
  const hasRequiredLine = lines.some(
    (line) => line.inventoryProductId && line.uom && Number(line.qty || 0) > 0,
  );
  const canSubmit =
    Boolean(form.supplierId && hasRequiredLine) && !isSubmitting;

  function openGenerateFromSource() {
    setGenerateFromError("");
    setError("");
    if (!form.supplierId) {
      setGenerateFromError(
        "Please select supplier profile first before using Generate From.",
      );
      setActiveTab("HEADER");
      return;
    }
    setSourceSearch("");
    setSelectedSourceType(null);
    setSelectedSourceId("");
    setSelectedSourceIds([]);
    setSourceProductsLoaded(false);
    setSourceLineQty({});
    setIsGenerateFromOpen(true);
  }

  function applySourceDocument(source: PurchaseTransactionRecord) {
    setIsGenerateFromOpen(false);
    setGenerateFromError("");
    router.push(`${DETAIL_PATH}?source=${source.id}`);
  }

  function getSourceLineRemainingQty(
    line: NonNullable<PurchaseTransactionRecord["lines"]>[number],
  ) {
    const value =
      (line as any).remainingQty ??
      (line as any).remainingReceiveQty ??
      (line as any).remainingInvoiceQty ??
      line.qty ??
      0;
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }

  const selectedSourceDocuments = useMemo(
    () =>
      props.sourceDocuments.filter((source) =>
        selectedSourceIds.includes(source.id),
      ),
    [props.sourceDocuments, selectedSourceIds],
  );

  function getSourceLineKey(
    source: PurchaseTransactionRecord,
    line: NonNullable<PurchaseTransactionRecord["lines"]>[number],
    index = 0,
  ) {
    return `${source.id}::${line.id || line.productCode || index}`;
  }

  const selectedSourceLinesRaw = useMemo(() => {
    return selectedSourceDocuments.flatMap((source) =>
      (source.lines || [])
        .map((line, index) => {
          const key = getSourceLineKey(source, line, index);
          return {
            source,
            line,
            key,
            remainingQty: getSourceLineRemainingQty(line),
          };
        })
        .filter((entry) => entry.remainingQty > 0),
    );
  }, [selectedSourceDocuments]);

  const selectedSourceLines = useMemo(
    () => (sourceProductsLoaded ? selectedSourceLinesRaw : []),
    [sourceProductsLoaded, selectedSourceLinesRaw],
  );

  function toggleSourceDocument(source: PurchaseTransactionRecord) {
    setSourceProductsLoaded(false);
    setSelectedSourceIds((prev) => {
      const exists = prev.includes(source.id);
      const next = exists
        ? prev.filter((id) => id !== source.id)
        : [...prev, source.id];
      setSourceLineQty((current) => {
        const updated = { ...current };
        if (exists) {
          for (const [index, line] of (source.lines || []).entries())
            delete updated[getSourceLineKey(source, line, index)];
        }
        return updated;
      });
      return next;
    });
  }

  function loadSelectedSourceProducts() {
    setGenerateFromError("");
    if (selectedSourceDocuments.length === 0) {
      setGenerateFromError("Please select at least one source document first.");
      return;
    }
    const nextQty: Record<string, string> = {};
    for (const source of selectedSourceDocuments) {
      for (const [index, line] of (source.lines || []).entries()) {
        const remainingQty = getSourceLineRemainingQty(line);
        if (remainingQty <= 0) continue;
        nextQty[getSourceLineKey(source, line, index)] = formatDecimalInput(
          remainingQty,
          qtyDecimalPlaces,
        );
      }
    }
    setSourceLineQty(nextQty);
    setSourceProductsLoaded(true);
  }

  function updateSourceLineQty(
    key: string,
    value: string,
    remainingQty: number,
  ) {
    const numeric = Number(value || 0);
    const safeValue = Number.isFinite(numeric)
      ? Math.min(Math.max(0, numeric), remainingQty)
      : 0;
    setSourceLineQty((prev) => ({
      ...prev,
      [key]: String(value).endsWith(".")
        ? value
        : formatDecimalInput(safeValue, qtyDecimalPlaces),
    }));
  }

  function importSelectedSourceDocuments() {
    if (!sourceProductsLoaded) {
      setGenerateFromError("Please click Load Product before importing.");
      return;
    }
    const selectedImportLines = selectedSourceLines.filter(
      ({ key, remainingQty }) => {
        const qty = Number(sourceLineQty[key] || 0);
        return qty > 0 && qty <= remainingQty;
      },
    );
    if (
      selectedSourceDocuments.length === 0 ||
      selectedImportLines.length === 0
    ) {
      setGenerateFromError(
        "Please enter a valid quantity for at least one product line.",
      );
      return;
    }
    const first = selectedSourceDocuments[0];
    setForm((prev) => ({
      ...prev,
      supplierId: first.supplierId || prev.supplierId,
      supplierName: first.supplierName || prev.supplierName,
      supplierAccountNo: first.supplierAccountNo || prev.supplierAccountNo,
      contactNo: first.contactNo || prev.contactNo,
      email: first.email || prev.email,
      currency: first.currency || prev.currency || "MYR",
      reference: selectedSourceDocuments
        .map((source) => source.docNo)
        .join(", "),
      docDesc: `Generated from ${selectedSourceDocuments.map((source) => source.docNo).join(", ")}`,
      remarks: first.remarks || prev.remarks,
      attention: first.attention || prev.attention,
      agentId: first.agentId || prev.agentId,
      projectId: first.projectId || prev.projectId,
      departmentId: first.departmentId || prev.departmentId,
      termsAndConditions: first.termsAndConditions || prev.termsAndConditions,
      bankAccount: first.bankAccount || prev.bankAccount,
      footerRemarks: first.footerRemarks || prev.footerRemarks,
    }));
    setLines(
      selectedImportLines.map(({ source, line, key, remainingQty }) => ({
        sourceLineId: line.id || "",
        sourceTransactionId: source.id,
        inventoryProductId: line.inventoryProductId || "",
        productCode: line.productCode || "",
        productDescription: line.productDescription || "",
        itemType: line.itemType || "STOCK_ITEM",
        uom: line.uom || "",
        qty: formatDecimalInput(
          Math.min(
            Math.max(0, Number(sourceLineQty[key] || remainingQty)),
            remainingQty,
          ),
          qtyDecimalPlaces,
        ),
        unitCost: formatDecimalInput(line.unitCost ?? 0, unitCostDecimalPlaces),
        discountRate: formatDecimalInput(line.discountRate ?? 0, 2),
        discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
        locationId: line.locationId || props.defaultLocationId,
        batchNo: line.batchNo || "",
        batchMode: line.batchNo ? "existing" : "existing",
        expiryDate: (line as any).expiryDate ? formatDateInput((line as any).expiryDate) : "",
        serialNos: Array.isArray(line.serialNos) ? line.serialNos : [],
        serialSearch: "",
        serialEntryText: "",
        taxCodeId: "",
        remarks: line.remarks || "",
      })),
    );
    setGeneratedSourceLabel(
      selectedSourceDocuments.map((source) => source.docNo).join(", "),
    );
    setIsGenerateFromOpen(false);
    setActiveTab("BODY");
  }

  function applySupplier(supplierId: string) {
    const supplier = props.initialSuppliers.find(
      (item) => item.id === supplierId,
    );
    setForm((prev) => ({
      ...prev,
      supplierId,
      supplierName: supplier?.name || "",
      supplierAccountNo: supplier?.supplierAccountNo || "",
      contactNo: supplier?.phone || "",
      email: supplier?.email || "",
      attention: supplier?.attention || "",
      currency: supplier?.currency || "MYR",
      agentId: supplier?.agentId || "",
    }));
  }
  function applyProduct(index: number, productId: string) {
    const product = props.initialProducts.find((item) => item.id === productId);
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              inventoryProductId: productId,
              productCode: product?.code || "",
              productDescription: product?.description || "",
              itemType: product?.itemType || "STOCK_ITEM",
              uom: product?.baseUom || "",
              unitCost: formatDecimalInput(
                product?.unitCost || 0,
                unitCostDecimalPlaces,
              ),
              locationId: line.locationId || props.defaultLocationId,
              batchNo: "",
              batchMode: "existing",
              expiryDate: "",
              serialNos: [],
              serialSearch: "",
              serialEntryText: "",
            }
          : line,
      ),
    );
  }
  function updateLine(index: number, key: keyof LineForm, value: string) {
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    );
  }

  function updateLineValues(index: number, values: Partial<LineForm>) {
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...values } : line,
      ),
    );
  }

  function setInboundBatch(index: number, value: string) {
    if (value === "__NEW__") {
      updateLineValues(index, { batchMode: "new", batchNo: "", expiryDate: "", serialNos: [], serialSearch: "", serialEntryText: "" });
      return;
    }
    const selectedBatch = (availableBatches[index] || []).find(
      (batch) => batch.batchNo.toUpperCase() === value.toUpperCase(),
    );
    updateLineValues(index, {
      batchMode: "existing",
      batchNo: value.toUpperCase(),
      expiryDate: selectedBatch?.expiryDate ? formatDateInput(selectedBatch.expiryDate) : "",
      serialNos: [],
      serialSearch: "",
      serialEntryText: "",
    });
  }

  function setInboundNewBatchValue(index: number, value: string) {
    updateLineValues(index, { batchMode: "new", batchNo: value.toUpperCase(), serialNos: [], serialSearch: "", serialEntryText: "" });
  }

  function addInboundSerial(index: number, serialNo: string) {
    const normalized = serialNo.trim().toUpperCase();
    if (!normalized) return;
    setLines((prev) =>
      prev.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const serialNos = uniqueSerialNos([...line.serialNos, normalized]);
        return {
          ...line,
          serialNos,
          qty: formatDecimalInput(serialNos.length, qtyDecimalPlaces),
          serialSearch: "",
          serialEntryText: "",
        };
      }),
    );
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      emptyLine(
        props.defaultLocationId,
        defaultTaxCodeId,
        qtyDecimalPlaces,
        unitCostDecimalPlaces,
      ),
    ]);
  }
  function removeLine(index: number) {
    setLines((prev) =>
      prev.length <= 1
        ? prev
        : prev.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  function hasActiveDownstream(item: PurchaseTransactionRecord) {
    return (item.sourceLinks || []).some((link) =>
      isActiveLinkedTransaction(link.targetTransaction),
    );
  }

  function hasActiveSourceDocument(item: PurchaseTransactionRecord) {
    return (item.targetLinks || []).some(
      (link) =>
        link.sourceTransaction && link.sourceTransaction.status !== "CANCELLED",
    );
  }

  function getGeneratedFromLabel(item: PurchaseTransactionRecord) {
    const sourceDocNos = (item.targetLinks || [])
      .map((link) => link.sourceTransaction)
      .filter(
        (source): source is NonNullable<typeof source> =>
          Boolean(source?.docNo) && source?.status !== "CANCELLED",
      )
      .map((source) => String(source.docNo));
    return sourceDocNos.length > 0
      ? Array.from(new Set(sourceDocNos)).join(", ")
      : "-";
  }

  function chooseSourceType(nextSourceType: PurchaseSourceDocumentType) {
    setSelectedSourceType(nextSourceType);
    setSourceSearch("");
    setSelectedSourceId("");
    setSelectedSourceIds([]);
    setSourceProductsLoaded(false);
    setSourceLineQty({});
    setGenerateFromError("");
  }

  function openCancelDialog(item: PurchaseTransactionRecord) {
    if (hasActiveDownstream(item)) {
      setError(
        `Please cancel downstream generated document first before cancelling this ${TITLE}.`,
      );
      return;
    }
    setError("");
    setMessage("");
    setCancelReason("");
    setCancelTarget(item);
  }

  async function confirmCancelTransaction() {
    if (!cancelTarget) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_PATH}/${cancelTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason.trim() || "Cancelled by admin",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || `Unable to cancel ${TITLE}.`);
        return;
      }
      setCancelTarget(null);
      setCancelReason("");
      setMessage("");
      setCancelNotice({
        docNo: cancelTarget.docNo,
        cancelledAt: new Date(),
        reason: cancelReason.trim() || "Cancelled by admin",
        cancelledByName:
          data.transaction?.cancelledByAdmin?.name ||
          data.transaction?.cancelledByAdminName ||
          data.transaction?.cancelledByName ||
          "RK Admin",
      });
      refreshStockBalances();
      router.refresh();
    } catch {
      setError(`Unable to cancel ${TITLE}.`);
    }
  }

  function resetPurchaseForm() {
    setDocNo("");
    setManualDocNoEnabled(false);
    setForm({
      docDate: todayInput(),
      docDesc: "",
      supplierId: "",
      supplierName: "",
      supplierAccountNo: "",
      contactNo: "",
      email: "",
      currency: "MYR",
      reference: "",
      remarks: "",
      attention: "",
      agentId: "",
      projectId: "",
      departmentId: "",
      taxCodeId: "",
      termsAndConditions: "",
      bankAccount: "",
      footerRemarks: "",
    });
    setLines([
      emptyLine(
        props.defaultLocationId,
        defaultTaxCodeId,
        qtyDecimalPlaces,
        unitCostDecimalPlaces,
      ),
    ]);
    setActiveTab("HEADER");
    setCancelNotice(null);
    setGeneratedSourceLabel("");
    refreshStockBalances();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCancelNotice(null);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const product = props.initialProducts.find(
        (item) => item.id === line.inventoryProductId,
      );
      if (!product || product.itemType !== "STOCK_ITEM") continue;
      if (product.batchTracking && !line.batchNo.trim()) {
        setError(`Product line ${index + 1} requires Batch No.`);
        setActiveTab("BODY");
        return;
      }
      if (product.serialNumberTracking) {
        if (line.serialNos.length === 0) {
          setError(`Product line ${index + 1} requires S/N No.`);
          setActiveTab("BODY");
          return;
        }
        if (Number(line.qty || 0) !== line.serialNos.length) {
          setError(`Product line ${index + 1} quantity must match selected S/N count.`);
          setActiveTab("BODY");
          return;
        }
      }
    }
    setIsSubmitting(true);
    const wasEditing = Boolean(editingTransaction);
    const wasRevising = Boolean(reviseTransaction && !editingTransaction);
    try {
      const response = await fetch(
        editingTransaction ? `${API_PATH}/${editingTransaction.id}` : API_PATH,
        {
          method: editingTransaction ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            docNo: manualDocNoEnabled ? docNo : undefined,
            sourceTransactionId: isRevisionMode
              ? null
              : sourceTransaction?.id ||
                lines.find((line) => line.sourceTransactionId)
                  ?.sourceTransactionId ||
                null,
            sourceDocType: isRevisionMode
              ? null
              : sourceTransaction?.docType ||
                props.sourceDocuments.find(
                  (source) =>
                    source.id ===
                    lines.find((line) => line.sourceTransactionId)
                      ?.sourceTransactionId,
                )?.docType ||
                null,
            revisedFromId: isRevisionMode
              ? reviseTransaction?.id || null
              : null,
            lines,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || `Unable to save ${TITLE}.`);
        return;
      }
      const savedId = data.transaction?.id || editingTransaction?.id;
      if (savedId) {
        setMessage(
          wasRevising
            ? `${TITLE} revised successfully.`
            : wasEditing
              ? `${TITLE} updated successfully.`
              : `${TITLE} saved successfully.`,
        );
        setIsCreateOpen(false);
        refreshStockBalances();
        router.push(DETAIL_PATH);
        router.refresh();
      } else {
        setMessage(
          wasRevising
            ? `${TITLE} revised successfully.`
            : wasEditing
              ? `${TITLE} updated successfully.`
              : `${TITLE} saved successfully.`,
        );
        refreshStockBalances();
        router.refresh();
      }
    } catch {
      setError(`Unable to save ${TITLE}.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const pageTitle = editingTransaction
    ? `Edit ${TITLE}`
    : isRevisionMode
      ? `Revise ${TITLE}`
      : `Create ${TITLE}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">{TITLE}</h1>
          <p className="mt-4 max-w-3xl text-white/70">{SUBTITLE}</p>
        </div>
      </div>

      {message && !isCreateOpen ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {cancelNotice && !isCreateOpen ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          <div className="font-semibold">
            This {TITLE.toLowerCase()} has been cancelled.
          </div>
          <div className="mt-2">
            Cancelled At: {formatDateTime(cancelNotice.cancelledAt)}
          </div>
          <div className="mt-1">
            Cancelled By: {cancelNotice.cancelledByName || "-"}
          </div>
          <div className="mt-1">Reason: {cancelNotice.reason}</div>
        </div>
      ) : null}

      {error && !isCreateOpen ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">
              {TITLE}
            </p>
            <h2 className="mt-4 text-2xl font-bold">
              Existing {TITLE} Records
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">
              Manage {TITLE.toLowerCase()} transaction records.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setError("");
              setCancelNotice(null);
              resetPurchaseForm();
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400"
          >
            Create {TITLE}
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input
              className="input-rk"
              placeholder={`Search ${TITLE.toLowerCase()} no / supplier`}
              readOnly
            />
            <CompactSelect
              options={statusOptions}
              value={listingStatus}
              onChange={setListingStatus}
            />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Generated From</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-white/50"
                  >
                    No {TITLE.toLowerCase()} found.
                  </td>
                </tr>
              ) : (
                visibleTransactions.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`${DETAIL_PATH}/${item.id}`)}
                    className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">
                        {item.docNo}
                      </div>
                      {item.revisedFrom?.docNo ? (
                        <Link
                          href={`${DETAIL_PATH}/${item.revisedFrom.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-2 inline-flex text-xs text-white/40 transition-colors hover:text-white/80"
                        >
                          ↳ Revision of {item.revisedFrom.docNo}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">{formatDate(item.docDate)}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">
                        {item.supplierName}
                      </div>
                      <div className="text-xs text-white/45">
                        {item.supplierAccountNo || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-white/65">
                      {getGeneratedFromLabel(item)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">{`${item.currency || "MYR"} ${money(item.grandTotal)}`}</td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== "CANCELLED" ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMessage("");
                                  setError("");
                                  setCancelNotice(null);
                                  router.push(`${DETAIL_PATH}?edit=${item.id}`);
                                }}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMessage("");
                                  setError("");
                                  setCancelNotice(null);
                                  router.push(
                                    `${DETAIL_PATH}?revise=${item.id}`,
                                  );
                                }}
                                className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/10"
                              >
                                Edit Revise
                              </button>
                            </>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCancelDialog(item);
                            }}
                            disabled={hasActiveDownstream(item)}
                            title={
                              hasActiveDownstream(item)
                                ? "Cancel downstream generated document first."
                                : "Cancel document"
                            }
                            className={`rounded-xl border px-3 py-2 text-xs transition ${hasActiveDownstream(item) ? "cursor-not-allowed border-white/10 text-white/30" : "border-red-500/30 text-red-200 hover:bg-red-500/10"}`}
                          >
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
            <form onSubmit={submit}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">
                    {TITLE}
                  </p>
                  <h2 className="mt-3 text-3xl font-bold">{pageTitle}</h2>
                </div>
                {!editingTransaction ? (
                  <button
                    type="button"
                    onClick={openGenerateFromSource}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
                  >
                    Generate From
                  </button>
                ) : null}
              </div>

              {message ? (
                <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {message}
                </div>
              ) : null}
              {error ? (
                <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
                {(["HEADER", "BODY", "FOOTER"] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-red-600 text-white" : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"}`}
                  >
                    {tab === "HEADER"
                      ? "Header"
                      : tab === "BODY"
                        ? "Body"
                        : "Footer"}
                  </button>
                ))}
              </div>

              {isBodyLocked ? (
                <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  This {TITLE} is generated from{" "}
                  {bodyLockSourceLabel}. Body product, qty, cost, discount,
                  tax, batch and serial details are locked to keep the generated
                  document tally with its source. Header and Footer are still
                  editable.
                </div>
              ) : null}
              {isBodyLocked ? (
                <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  Imported from{" "}
                  {bodyLockSourceLabel}. Body is locked because this {TITLE}
                  is generated from source document.
                </div>
              ) : null}

              <div>
                {activeTab === "HEADER" ? (
                  <div className="mt-6 space-y-6">
            {generateFromError ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        {generateFromError}
                      </div>
                    ) : null}
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label className="label-rk">Doc Date</label>
                        <input
                          type="date"
                          value={form.docDate}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              docDate: e.target.value,
                            }))
                          }
                          className="input-rk"
                        />
                      </div>
                      <div className="xl:col-span-3">
                        <label className="label-rk">System Doc No</label>
                        <div className="flex overflow-hidden rounded-xl border border-white/10 bg-black/40">
                          <input
                            value={docNoPreview}
                            readOnly
                            placeholder="Auto-generated"
                            className="min-h-[52px] flex-1 bg-transparent px-4 text-white outline-none disabled:text-white/60"
                          />
                          <button
                            type="button"
                            disabled={Boolean(editingTransaction) || isRevisionMode}
                            onClick={() => {
                              setDocNoDraft(docNo);
                              setShowDocNoOverride(true);
                            }}
                            className="px-4 text-xs text-white/45 hover:text-white disabled:opacity-40"
                          >
                            Click to override
                          </button>
                        </div>
                      </div>
                      <SearchableSelect
                        label="A/C No"
                        placeholder="Search or select supplier"
                        options={supplierOptions}
                        value={form.supplierId}
                        onChange={(option) => applySupplier(option?.id || "")}
                      />
                      <div>
                        <label className="label-rk">Supplier Name</label>
                        <input
                          value={form.supplierName}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              supplierName: e.target.value,
                            }))
                          }
                          className="input-rk"
                        />
                      </div>
                      <div>
                        <label className="label-rk">Email</label>
                        <input
                          value={form.email}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              email: e.target.value,
                            }))
                          }
                          className="input-rk"
                        />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="label-rk">Document Description</label>
                        <input
                          value={form.docDesc}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              docDesc: e.target.value,
                            }))
                          }
                          placeholder="Optional description"
                          className="input-rk"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label className="label-rk">Attention</label>
                        <input
                          value={form.attention}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              attention: e.target.value,
                            }))
                          }
                          className="input-rk"
                        />
                      </div>
                      <div>
                        <label className="label-rk">Contact No</label>
                        <input
                          value={form.contactNo}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              contactNo: e.target.value,
                            }))
                          }
                          className="input-rk"
                        />
                      </div>
                      <SearchableSelect
                        label="Agent"
                        placeholder="No Agent"
                        options={agentOptions}
                        value={form.agentId}
                        onChange={(option) =>
                          setForm((prev) => ({
                            ...prev,
                            agentId: option?.id || "",
                          }))
                        }
                      />
                      {props.projectFeatureEnabled ? (
                        <SearchableSelect
                          label="Project"
                          placeholder="No Project"
                          options={projectOptions}
                          value={form.projectId}
                          onChange={(option) =>
                            setForm((prev) => ({
                              ...prev,
                              projectId: option?.id || "",
                              departmentId: "",
                            }))
                          }
                        />
                      ) : null}
                      {props.departmentFeatureEnabled ? (
                        <SearchableSelect
                          label="Department"
                          placeholder={
                            form.projectId
                              ? "No Department"
                              : "Select project first"
                          }
                          options={departmentOptions}
                          value={form.departmentId}
                          disabled={!form.projectId}
                          onChange={(option) =>
                            setForm((prev) => ({
                              ...prev,
                              departmentId: option?.id || "",
                            }))
                          }
                        />
                      ) : null}
                    </div>
                    <div className="rounded-[1.75rem] border border-white/10 p-5">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
                        Billing Address
                      </h3>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="label-rk">Address Line 1</label>
                          <input
                            className="input-rk"
                            value={
                              form.supplierId
                                ? props.initialSuppliers.find(
                                    (item) => item.id === form.supplierId,
                                  )?.billingAddressLine1 || ""
                                : ""
                            }
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="label-rk">Address Line 2</label>
                          <input
                            className="input-rk"
                            value={
                              form.supplierId
                                ? props.initialSuppliers.find(
                                    (item) => item.id === form.supplierId,
                                  )?.billingAddressLine2 || ""
                                : ""
                            }
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="label-rk">Address Line 3</label>
                          <input
                            className="input-rk"
                            value={
                              form.supplierId
                                ? props.initialSuppliers.find(
                                    (item) => item.id === form.supplierId,
                                  )?.billingAddressLine3 || ""
                                : ""
                            }
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="label-rk">Address Line 4</label>
                          <input
                            className="input-rk"
                            value={
                              form.supplierId
                                ? props.initialSuppliers.find(
                                    (item) => item.id === form.supplierId,
                                  )?.billingAddressLine4 || ""
                                : ""
                            }
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="label-rk">City</label>
                          <input
                            className="input-rk"
                            value={
                              form.supplierId
                                ? props.initialSuppliers.find(
                                    (item) => item.id === form.supplierId,
                                  )?.billingCity || ""
                                : ""
                            }
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="label-rk">Post Code</label>
                          <input
                            className="input-rk"
                            value={
                              form.supplierId
                                ? props.initialSuppliers.find(
                                    (item) => item.id === form.supplierId,
                                  )?.billingPostCode || ""
                                : ""
                            }
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="label-rk">Remarks</label>
                      <textarea
                        value={form.remarks}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            remarks: e.target.value,
                          }))
                        }
                        className="input-rk min-h-[90px]"
                      />
                    </div>
                  </div>
                ) : null}

                {activeTab === "BODY" ? (
                  <div className="space-y-5">
                    {isBodyLocked ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                        Partially locked body section. This {TITLE} was generated from
                        source document, so product, qty, cost, discount, tax,
                        and line pricing details are locked. Batch No and S/N No remain selectable for tracked stock items.
                      </div>
                    ) : null}
                    <div className={isBodyLocked ? "opacity-70" : ""}>
                      {lines.map((line, index) => {
                        const product =
                          props.initialProducts.find(
                            (item) => item.id === line.inventoryProductId,
                          ) || null;
                        const grossAmount = lineAmount(line);
                        const selectedLineTaxCode =
                          props.taxConfig.taxCodes.find(
                            (item) => item.id === line.taxCodeId,
                          ) || null;
                        const lineTax = calculateLineItemTaxBreakdown({
                          lineTotal: grossAmount,
                          taxRate: selectedLineTaxCode?.rate || 0,
                          calculationMethod:
                            selectedLineTaxCode?.calculationMethod || null,
                          taxEnabled:
                            props.taxConfig.taxModuleEnabled &&
                            Boolean(selectedLineTaxCode),
                        });
                        const balanceKeyValue =
                          line.inventoryProductId && line.locationId
                            ? balanceKey(
                                line.inventoryProductId,
                                line.locationId,
                                product?.batchTracking ? line.batchNo : "",
                              )
                            : "";
                        const serialAvailabilityKeyValue =
                          line.inventoryProductId && line.locationId
                            ? serialAvailabilityKey(
                                line.inventoryProductId,
                                line.locationId,
                                product?.batchTracking ? line.batchNo : "",
                              )
                            : "";
                        const balanceText =
                          line.inventoryProductId && line.locationId
                            ? product?.serialNumberTracking
                              ? product.batchTracking && !line.batchNo
                                ? "Select Batch No to view serial availability."
                                : formatSerialAvailability(
                                    serialAvailabilityCounts[serialAvailabilityKeyValue],
                                    Boolean(loadingSerialAvailability[serialAvailabilityKeyValue]),
                                    qtyDecimalPlaces,
                                  )
                              : product?.batchTracking && !line.batchNo
                                ? "Select Batch No to view batch balance."
                                : formatQtyBalance(
                                    balances[balanceKeyValue],
                                    Boolean(loadingBalances[balanceKeyValue]),
                                    qtyDecimalPlaces,
                                  )
                            : "Select product and location to view balance.";
                        return (
                          <div
                            key={index}
                            className="rounded-[1.75rem] border border-white/10 p-5"
                          >
                            <div className="mb-5 flex items-center justify-between">
                              <h3 className="text-lg font-semibold text-white">
                                Product {index + 1}
                              </h3>
                              {lines.length > 1 && !isBodyLocked ? (
                                <button
                                  type="button"
                                  onClick={() => removeLine(index)}
                                  className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                              <div className="md:col-span-2">
                                <SearchableSelect
                                  label="Product"
                                  placeholder="Search or select product"
                                  options={productOptions}
                                  value={line.inventoryProductId}
                                  disabled={isBodyLocked}
                                  onChange={(option) =>
                                    applyProduct(index, option?.id || "")
                                  }
                                />
                              </div>
                              <SearchableSelect
                                label="UOM"
                                placeholder="Select UOM"
                                options={getProductUomOptions(product).map(
                                  (option) => ({
                                    id: option.id,
                                    label: option.label,
                                    searchText: option.label.toLowerCase(),
                                  }),
                                )}
                                value={line.uom}
                                disabled={isBodyLocked || !product}
                                onChange={(option) =>
                                  updateLine(
                                    index,
                                    "uom",
                                    option?.id || product?.baseUom || "",
                                  )
                                }
                              />
                              <div>
                                <label className="label-rk">Qty</label>
                                <input
                                  value={line.qty}
                                  onChange={(e) =>
                                    updateLine(index, "qty", e.target.value)
                                  }
                                  className="input-rk"
                                  disabled={isBodyLocked || Boolean(product?.serialNumberTracking)}
                                />
                              </div>
                              <div>
                                <label className="label-rk">
                                  Purchase Unit Cost
                                </label>
                                <input
                                  value={line.unitCost}
                                  onChange={(e) =>
                                    updateLine(
                                      index,
                                      "unitCost",
                                      e.target.value,
                                    )
                                  }
                                  className="input-rk"
                                  disabled={isBodyLocked}
                                />
                              </div>
                              <div>
                                <label className="label-rk">Discount</label>
                                <div className="grid grid-cols-[1fr_120px] gap-3">
                                  <input
                                    value={line.discountRate}
                                    onChange={(e) =>
                                      updateLine(
                                        index,
                                        "discountRate",
                                        e.target.value,
                                      )
                                    }
                                    className="input-rk"
                                    disabled={isBodyLocked}
                                  />
                                  <CompactSelect
                                    options={discountTypeOptions}
                                    value={line.discountType}
                                    disabled={isBodyLocked}
                                    onChange={(value) =>
                                      updateLine(index, "discountType", value)
                                    }
                                  />
                                </div>
                              </div>
                              <div className="md:col-span-2">
                                <SearchableSelect
                                  label="Location"
                                  placeholder="Search or select location"
                                  options={locationOptions}
                                  value={line.locationId}
                                  disabled={isBodyLocked}
                                  onChange={(option) =>
                                    updateLine(
                                      index,
                                      "locationId",
                                      option?.id || "",
                                    )
                                  }
                                />
                                <p className="mt-2 text-xs text-white/40">
                                  {balanceText}
                                </p>
                              </div>
                              {product?.batchTracking ? (
                                <>
                                  <div className="md:col-span-2">
                                    <SearchableSelect
                                      label="Batch No"
                                      placeholder={loadingBatches[index] ? "Loading existing batch numbers..." : "Select existing batch or create new"}
                                      options={[
                                        { id: "__NEW__", label: "+ Create New Batch", searchText: "create new batch new" },
                                        ...(availableBatches[index] || []).map((batch) => ({
                                          id: batch.batchNo,
                                          label: `${batch.batchNo}${typeof batch.balance === "number" ? ` • Bal ${batch.balance.toLocaleString("en-MY", { minimumFractionDigits: qtyDecimalPlaces, maximumFractionDigits: qtyDecimalPlaces })}` : ""}${batch.expiryDate ? ` • Exp ${formatBatchExpiryDate(batch.expiryDate)}` : ""}`,
                                          searchText: `${batch.batchNo} ${batch.expiryDate || ""}`.toLowerCase(),
                                        })),
                                      ]}
                                      value={line.batchMode === "new" ? "__NEW__" : line.batchNo}
                                      disabled={Boolean(loadingBatches[index])}
                                      onChange={(option) => setInboundBatch(index, option?.id || "")}
                                    />
                                    <p className="mt-2 text-xs text-white/45">
                                      {line.batchMode === "new"
                                        ? "Create a new batch no for this stock-in transaction."
                                        : (availableBatches[index] || []).length > 0
                                          ? "Select an existing batch or choose “Create New Batch”."
                                          : "No existing batch numbers found. Choose “Create New Batch” to continue."}
                                    </p>
                                  </div>

                                  {line.batchMode === "new" ? (
                                    <div>
                                      <label className="label-rk">New Batch No</label>
                                      <input
                                        className="input-rk"
                                        value={line.batchNo}
                                        onChange={(e) => setInboundNewBatchValue(index, e.target.value)}
                                        placeholder="Enter new batch no"
                                      />
                                    </div>
                                  ) : null}

                                  <div>
                                    <label className="label-rk">Expiry Date</label>
                                    <input
                                      type="date"
                                      className="input-rk"
                                      value={line.expiryDate}
                                      onChange={(e) => updateLine(index, "expiryDate", e.target.value)}
                                    />
                                  </div>
                                </>
                              ) : null}
                              {product?.serialNumberTracking ? (
                                <>
                                  <div className="md:col-span-2">
                                    <SearchableSelect
                                      label="Serial No"
                                      placeholder="Select existing serial or create new"
                                      options={[
                                        { id: "__NEW__", label: "+ Create New Serial", searchText: "create new serial" },
                                        ...(line.serialNos.length > 1
                                          ? [{ id: "__COUNT__", label: `${line.serialNos.length} serial(s) selected`, searchText: line.serialNos.join(" ").toLowerCase() }]
                                          : []),
                                        ...line.serialNos.map((serialNo) => ({
                                          id: serialNo,
                                          label: serialNo,
                                          searchText: serialNo.toLowerCase(),
                                        })),
                                      ]}
                                      value={line.serialSearch === "__NEW__" ? "__NEW__" : line.serialNos.length > 1 ? "__COUNT__" : line.serialNos[0] || ""}
                                      onChange={(option) => {
                                        if (!option) return;
                                        if (option.id === "__NEW__") {
                                          updateLineValues(index, { serialSearch: "__NEW__", serialEntryText: "" });
                                          return;
                                        }
                                        if (option.id === "__COUNT__") return;
                                        addInboundSerial(index, option.id);
                                      }}
                                    />
                                    <p className="mt-2 text-xs text-white/45">
                                      Qty auto-follows selected serial count and uses Base UOM.
                                    </p>

                                    {line.serialNos.length > 0 ? (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {line.serialNos.map((serialNo) => (
                                          <button
                                            key={serialNo}
                                            type="button"
                                            onClick={() =>
                                              setLines((prev) =>
                                                prev.map((item, itemIndex) => {
                                                  if (itemIndex !== index) return item;
                                                  const serialNos = item.serialNos.filter((value) => value.toUpperCase() !== serialNo.toUpperCase());
                                                  return { ...item, serialNos, qty: formatDecimalInput(serialNos.length, qtyDecimalPlaces) };
                                                }),
                                              )
                                            }
                                            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
                                          >
                                            {serialNo} ×
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>

                                  {line.serialSearch === "__NEW__" ? (
                                    <div>
                                      <label className="label-rk">New Serial No</label>
                                      <div className="flex gap-3">
                                        <input
                                          className="input-rk"
                                          value={line.serialEntryText}
                                          onChange={(e) => updateLine(index, "serialEntryText", e.target.value.toUpperCase())}
                                          placeholder="Enter new serial no"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => addInboundSerial(index, line.serialEntryText)}
                                          className="inline-flex items-center justify-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                                        >
                                          Add
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              {props.taxConfig.taxModuleEnabled &&
                              taxMode === "LINE_ITEM" ? (
                                <SearchableSelect
                                  label="Tax Code"
                                  placeholder="No Tax"
                                  options={taxCodeOptions}
                                  value={line.taxCodeId}
                                  disabled={isBodyLocked}
                                  onChange={(option) =>
                                    updateLine(
                                      index,
                                      "taxCodeId",
                                      option?.id || "",
                                    )
                                  }
                                />
                              ) : null}
                              <div>
                                <label className="label-rk">Tax Amount</label>
                                <input
                                  value={money(lineTax.taxAmount)}
                                  readOnly
                                  className="input-rk"
                                />
                              </div>
                              <div>
                                <label className="label-rk">Gross Amount</label>
                                <input
                                  value={money(grossAmount)}
                                  readOnly
                                  className="input-rk"
                                />
                              </div>
                              <div className="md:col-span-2 xl:col-span-4">
                                <label className="label-rk">
                                  Product Remarks
                                </label>
                                <textarea
                                  value={line.remarks}
                                  onChange={(e) =>
                                    updateLine(index, "remarks", e.target.value)
                                  }
                                  className="input-rk min-h-[80px]"
                                  disabled={isBodyLocked}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!isBodyLocked ? (
                      <button
                        type="button"
                        onClick={addLine}
                        className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
                      >
                        + Add Product
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === "FOOTER" ? (
                  <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                    <div className="space-y-5">
                      <div>
                        <label className="label-rk">Terms & Conditions</label>
                        <textarea
                          value={form.termsAndConditions}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              termsAndConditions: e.target.value,
                            }))
                          }
                          placeholder="Enter terms manually. Template picker can be added in later phase."
                          className="input-rk min-h-[140px]"
                        />
                      </div>
                      <div>
                        <label className="label-rk">Bank Account</label>
                        <textarea
                          value={form.bankAccount}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              bankAccount: e.target.value,
                            }))
                          }
                          className="input-rk min-h-[100px]"
                        />
                      </div>
                      <div>
                        <label className="label-rk">Footer Remarks</label>
                        <textarea
                          value={form.footerRemarks}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              footerRemarks: e.target.value,
                            }))
                          }
                          className="input-rk min-h-[100px]"
                        />
                      </div>
                    </div>
                    <div className="h-fit rounded-[1.75rem] border border-white/10 bg-black/30 p-5 text-sm">
                      <h3 className="text-xl font-semibold text-white">
                        {TITLE} Summary
                      </h3>
                      <div className="mt-5 space-y-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/70">Subtotal</span>
                          <span>{money(totals.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Discount</span>
                          <span>{money(totals.discount)}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-4">
                          <span className="text-white/70">Tax</span>
                          <span>{money(totals.tax)}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-5 text-lg font-bold">
                          <span>Grand Total ({form.currency || "MYR"})</span>
                          <span>{money(totals.grandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex justify-end gap-3 border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setError("");
                    resetPurchaseForm();
                    setIsCreateOpen(false);
                    router.push(DETAIL_PATH);
                  }}
                  className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : `Save ${TITLE}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isGenerateFromOpen ? (
        <div className="fixed inset-0 z-[150] overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-5xl rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300/80">
              Generate From
            </p>
            <h3 className="mt-3 text-3xl font-bold">
              {selectedSourceType
                ? `Pick From ${selectedSourceTypeLabel}`
                : "Pick Document Source"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/60">
              {selectedSourceType
                ? `Only ${selectedSourceTypeLabel} documents with remaining return qty are shown.`
                : "Choose whether this Purchase Return should be generated from a Purchase Invoice or Cash Purchase."}
            </p>

            {!selectedSourceType ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => chooseSourceType("PI")}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10"
                >
                  <div className="text-lg font-bold text-white">
                    Purchase Invoice
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Generate Purchase Return from Purchase Invoice balance.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => chooseSourceType("CP")}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10"
                >
                  <div className="text-lg font-bold text-white">
                    Cash Purchase
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Generate Purchase Return from Cash Purchase balance.
                  </div>
                </button>
              </div>
            ) : null}

            {selectedSourceType ? (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => chooseSourceType("PI")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    selectedSourceType === "PI"
                      ? "border border-sky-500/30 bg-sky-500/20 text-sky-100"
                      : "border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  Purchase Invoice
                </button>
                <button
                  type="button"
                  onClick={() => chooseSourceType("CP")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    selectedSourceType === "CP"
                      ? "border border-sky-500/30 bg-sky-500/20 text-sky-100"
                      : "border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  Cash Purchase
                </button>
              </div>
            ) : null}

            {selectedSourceType ? (
              <div className="mt-6">
                <input
                  className="input-rk"
                  value={sourceSearch}
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder={`Search ${selectedSourceTypeLabel.toLowerCase()}`}
                />
              </div>
            ) : null}

            {generateFromError ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {generateFromError}
              </div>
            ) : null}

            {selectedSourceType ? (
              <div className="mt-5 max-h-64 overflow-y-auto rounded-2xl border border-white/10">
                {filteredSourceDocuments.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-white/50">
                  No pending source document found for this supplier.
                </div>
              ) : (
                filteredSourceDocuments.map((source) => {
                  const isSelected = selectedSourceIds.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggleSourceDocument(source)}
                      className={`flex w-full items-start gap-4 border-b border-white/10 px-4 py-4 text-left transition last:border-b-0 ${isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
                    >
                      <span
                        className={`mt-1 flex h-4 w-4 items-center justify-center rounded border text-[10px] ${isSelected ? "border-red-400 bg-red-500 text-white" : "border-white/30"}`}
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-white">
                            {source.docNo}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(source.status)}`}
                          >
                            {source.status}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                          {source.supplierName}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {source.supplierAccountNo || "-"} •{" "}
                          {formatDate(source.docDate)} •{" "}
                          {source.currency || "MYR"}{" "}
                          {money(Number(source.grandTotal || 0))}
                        </div>
                      </div>
                    </button>
                  );
                })
                )}
              </div>
            ) : null}

            {selectedSourceType && sourceProductsLoaded && selectedSourceLines.length > 0 ? (
              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[1.2fr_1.8fr_0.8fr_0.8fr_1fr] gap-4 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/45">
                  <div>Document</div>
                  <div>Product</div>
                  <div className="text-right">Ordered</div>
                  <div className="text-right">Remaining</div>
                  <div className="text-right">Invoice / Claim</div>
                </div>
                {selectedSourceLines.map(
                  ({ source, line, key, remainingQty }) => (
                    <div
                      key={key}
                      className="grid grid-cols-[1.2fr_1.8fr_0.8fr_0.8fr_1fr] items-center gap-4 border-b border-white/10 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="font-semibold text-white">
                        {source.docNo}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {line.productCode || "-"}
                        </div>
                        <div className="text-xs text-white/45">
                          {line.productDescription || ""}
                        </div>
                      </div>
                      <div className="text-right text-white/75">
                        {money(line.qty)}
                      </div>
                      <div className="text-right text-white/75">
                        {money(remainingQty)}
                      </div>
                      <div>
                        <input
                          className="input-rk text-right"
                          type="number"
                          min="0"
                          max={remainingQty}
                          step="0.001"
                          value={
                            sourceLineQty[key] ??
                            formatDecimalInput(remainingQty, qtyDecimalPlaces)
                          }
                          onChange={(event) =>
                            updateSourceLineQty(
                              key,
                              event.target.value,
                              remainingQty,
                            )
                          }
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsGenerateFromOpen(false)}
                className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:bg-white/10"
              >
                Close
              </button>
              {!sourceProductsLoaded ? (
                <button
                  type="button"
                  disabled={!selectedSourceType || selectedSourceDocuments.length === 0}
                  onClick={loadSelectedSourceProducts}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-6 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Load Product
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selectedSourceType || selectedSourceLines.length === 0}
                  onClick={importSelectedSourceDocuments}
                  className="rounded-xl bg-red-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Import Selected
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <h3 className="text-2xl font-bold text-white">Cancel {TITLE}</h3>
            <p className="mt-3 text-sm text-white/60">
              Please enter a reason to cancel {cancelTarget.docNo}.
            </p>
            <textarea
              className="input-rk mt-5 min-h-[120px]"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Cancellation reason"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10"
              >
                Close
              </button>
              <button
                type="button"
                onClick={confirmCancelTransaction}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDocNoOverride ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">
              Manual Document No
            </p>
            <h3 className="mt-3 text-2xl font-bold">Override Document No</h3>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Leave empty to use the auto generated document number. Maximum 30
              characters.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="label-rk">Auto Generated Preview</label>
                <div className="input-rk flex items-center text-white">
                  {autoDocNoPreview}
                </div>
              </div>
              <div>
                <label className="label-rk">Custom Document No</label>
                <input
                  className="input-rk"
                  value={docNoDraft}
                  onChange={(event) =>
                    setDocNoDraft(normalizeDocNoInput(event.target.value))
                  }
                  placeholder="Enter custom document no"
                  autoFocus
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDocNoOverride(false)}
                className="rounded-xl border border-white/15 px-4 py-3 text-white/75 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const normalized = normalizeDocNoInput(docNoDraft);
                  setDocNo(normalized);
                  setManualDocNoEnabled(Boolean(normalized));
                  setShowDocNoOverride(false);
                }}
                className="rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
