"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
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
  deliveryAddresses?: Array<{
    id: string;
    label?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    addressLine3?: string | null;
    addressLine4?: string | null;
    city?: string | null;
    postCode?: string | null;
    countryCode?: string | null;
  }>;
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
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
  uomConversions?: Array<{ id?: string; uomCode: string; conversionRate: number }>;
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
    itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
    uom?: string | null;
    qty?: string | number | null;
    deliveredQty?: string | number | null;
    remainingDeliveryQty?: string | number | null;
    orderedAmount?: string | number | null;
    deliveredAmount?: string | number | null;
    remainingDeliveryAmount?: string | number | null;
    unitPrice?: string | number | null;
    discountRate?: string | number | null;
    discountType?: string | null;
    locationId?: string | null;
    taxCodeId?: string | null;
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
  status: "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED" | "RETURNED" | "PARTIAL_RETURN";
  displayStatus?: string | null;
  returnStatus?: string | null;
  grandTotal: string | number;
  cancelReason?: string | null;
  cancelledAt?: string | Date | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelledByAdminName?: string | null;
  cancelledByAdmin?: { id?: string | null; name?: string | null; email?: string | null } | null;
  revisedFrom?: { id: string; docNo?: string | null } | null;
  revisions?: Array<{ id: string; docNo?: string | null; status?: string | null }>;
  targetLinks?: Array<{ sourceTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
  downstreamLinks?: Array<{ targetTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
  lines?: Array<{
    inventoryProductId?: string | null;
    productCode?: string | null;
    productDescription?: string | null;
    itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
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

type StockNumberFormatConfig = {
  qtyDecimalPlaces: number;
  unitCostDecimalPlaces: number;
  priceDecimalPlaces: number;
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
  claimAmount: string;
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

type PickLine = {
  key: string;
  sourceTransactionId: string;
  sourceDocNo: string;
  sourceLineId: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  uom: string;
  orderedQty: number;
  deliveredQty: number;
  remainingDeliveryQty: number;
  orderedAmount: number;
  deliveredAmount: number;
  remainingDeliveryAmount: number;
  unitPrice: number;
  discountRate: number;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  remarks: string;
  deliverQty: string;
  deliverAmount: string;
};

type SearchableSelectOption = { id: string; label: string; searchText: string };

type BalanceResponse = { ok?: boolean; balance?: number; error?: string };

type AvailableBatch = {
  id: string;
  batchNo: string;
  expiryDate?: string | null;
  balance?: number | null;
};

type AvailableSerial = {
  id: string;
  serialNo: string;
  batchNo?: string | null;
  expiryDate?: string | null;
};

type AssemblyTraceLine = {
  id: string;
  productId: string;
  productCode: string;
  productDescription: string;
  qty: number;
  uom?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  adjustmentDirection?: "IN" | "OUT" | null;
  locationLabel?: string | null;
  remarks?: string | null;
  serialNos?: string[];
  serialEntries?: Array<{ id: string; serialNo: string; batchNo?: string | null; expiryDate?: string | null }>;
};

type AssemblyTrace = {
  id: string;
  transactionNo: string;
  docNo?: string | null;
  transactionDate?: string | null;
  docDate?: string | null;
  reference?: string | null;
  remarks?: string | null;
  finishedGoods: AssemblyTraceLine[];
  components: AssemblyTraceLine[];
};

function balanceKey(productId: string, locationId: string, batchNo?: string) {
  return `${productId}__${locationId}__${(batchNo || "").trim().toUpperCase()}`;
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

function batchOptionLabel(batch: AvailableBatch, qtyDecimalPlaces: number) {
  const parts = [batch.batchNo];
  if (typeof batch.balance === "number") parts.push(`Bal ${moneyWithPlaces(batch.balance, qtyDecimalPlaces)}`);
  if (batch.expiryDate) parts.push(`Exp ${batch.expiryDate.slice(0, 10)}`);
  return parts.join(" • ");
}

function formatTraceDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTraceExpiryDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTraceLineMeta(line: AssemblyTraceLine, qtyDecimalPlaces: number) {
  const parts = [`Qty: ${moneyWithPlaces(Number(line.qty || 0), qtyDecimalPlaces)}${line.uom ? ` ${line.uom}` : ""}`];

  if (line.batchNo) {
    const expiryDate = formatTraceExpiryDate(line.expiryDate);
    parts.push(`Batch No: ${line.batchNo}${expiryDate ? ` (Expiry Date: ${expiryDate})` : ""}`);
  }

  const serialEntries = Array.isArray(line.serialEntries) ? line.serialEntries : [];
  if (serialEntries.length > 0) {
    const serialText = serialEntries
      .map((entry) => {
        const expiryDate = formatTraceExpiryDate(entry.expiryDate);
        const batchText = entry.batchNo ? ` / Batch No: ${entry.batchNo}${expiryDate ? ` (Expiry Date: ${expiryDate})` : ""}` : "";
        return `${entry.serialNo}${batchText}`;
      })
      .join(", ");
    parts.push(`Serial No: ${serialText}`);
  } else if (Array.isArray(line.serialNos) && line.serialNos.length > 0) {
    parts.push(`Serial No: ${line.serialNos.join(", ")}`);
  }

  if (line.locationLabel) parts.push(`Location: ${line.locationLabel}`);
  return parts.join(" • ");
}

function getBalanceDisplay(value: number | undefined, isLoading: boolean, decimalPlaces: number) {
  if (isLoading) return "Loading balance...";
  if (typeof value !== "number") return "Select product and location to view balance.";
  return `Current Balance: ${moneyWithPlaces(value, decimalPlaces)}`;
}


function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDecimalPlaces(value: unknown, fallback = 2) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(6, Math.trunc(numeric)));
}

function decimalStep(decimalPlaces: number) {
  return decimalPlaces <= 0 ? "1" : `0.${"0".repeat(Math.max(0, decimalPlaces - 1))}1`;
}

function formatDecimalInput(value: unknown, decimalPlaces: number) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return (0).toFixed(decimalPlaces);
  return numeric.toFixed(decimalPlaces);
}

function limitDecimalInputValue(value: string, decimalPlaces: number) {
  const raw = String(value ?? "");
  if (!raw) return "";

  const sanitized = raw.replace(/[^0-9.]/g, "");
  const [wholePart, ...decimalParts] = sanitized.split(".");
  const whole = wholePart || "0";

  if (decimalPlaces <= 0) {
    return whole;
  }

  if (decimalParts.length === 0) {
    return whole;
  }

  const decimal = decimalParts.join("").slice(0, decimalPlaces);
  return `${whole}.${decimal}`;
}

function normalizeDecimalInputValue(value: string, decimalPlaces: number) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(decimalPlaces);
}

function moneyWithPlaces(value: number, decimalPlaces: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces });
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
function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}


function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBaseDeliveryOrderDocNo(docNo: string | null | undefined) {
  const value = String(docNo || "").trim().toUpperCase();
  const match = value.match(/^(DO-\d{8}-\d{4})(?:-(\d+))?$/);
  return match ? match[1] : value;
}

function buildDeliveryOrderRevisionDocNoPreview(transaction: DeliveryOrderRecord) {
  const baseDocNo = getBaseDeliveryOrderDocNo(transaction.revisedFrom?.docNo || transaction.docNo);
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

function formatCancelDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCancelledByName(transaction: {
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelledByAdminName?: string | null;
  cancelledByAdmin?: { name?: string | null } | null;
}) {
  return transaction.cancelledBy || transaction.cancelledByName || transaction.cancelledByAdminName || transaction.cancelledByAdmin?.name || "-";
}

function getCancelReason(transaction: { cancelReason?: string | null }) {
  return transaction.cancelReason && transaction.cancelReason.trim() ? transaction.cancelReason : "-";
}

function CancelledTransactionNotice({
  transaction,
  label,
}: {
  transaction: {
    cancelReason?: string | null;
    cancelledAt?: string | Date | null;
    cancelledBy?: string | null;
    cancelledByName?: string | null;
    cancelledByAdminName?: string | null;
    cancelledByAdmin?: { name?: string | null } | null;
  };
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
      <div className="font-semibold">This {label} has been cancelled.</div>
      <div className="mt-3 space-y-2 text-white/85">
        <div>Cancelled At: {formatCancelDateTime(transaction.cancelledAt)}</div>
        <div>Cancelled By: {getCancelledByName(transaction)}</div>
        <div>Reason: {getCancelReason(transaction)}</div>
      </div>
    </div>
  );
}

function getSalesDocumentLabel(_transaction: DeliveryOrderRecord) {
  return "delivery order";
}

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "RETURNED") return "border-white/15 bg-white/5 text-white/55";
  if (status === "PARTIAL_RETURN") return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  if (status === "CONFIRMED" || status === "COMPLETED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (status === "PARTIAL") return "border-indigo-500/25 bg-indigo-500/10 text-indigo-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

function getDisplayStatus(transaction: { status?: string | null; displayStatus?: string | null; returnStatus?: string | null }) {
  return transaction.displayStatus || transaction.returnStatus || transaction.status || "OPEN";
}

function emptyLine(defaultTaxCodeId = "", defaultLocationId = "", qtyDecimalPlaces = 2, priceDecimalPlaces = 2): LineForm {
  return {
    sourceLineId: "",
    sourceTransactionId: "",
    inventoryProductId: "",
    productCode: "",
    productDescription: "",
    itemType: "STOCK_ITEM",
    uom: "",
    qty: formatDecimalInput(1, qtyDecimalPlaces),
    claimAmount: formatDecimalInput(0, priceDecimalPlaces),
    unitPrice: formatDecimalInput(0, priceDecimalPlaces),
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

function CompactSelect({ options, value, onChange, disabled = false }: { options: SearchableSelectOption[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
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
      <button type="button" disabled={disabled} onClick={() => { if (!disabled) setIsOpen((prev) => !prev); }} className={`input-rk flex items-center justify-between gap-3 pr-20 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
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


function OutboundSerialPicker({
  label,
  availableSerials,
  selectedSerials,
  searchValue,
  onSearchValueChange,
  onToggle,
  disabled = false,
}: {
  label: string;
  availableSerials: AvailableSerial[];
  selectedSerials: string[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onToggle: (serialNo: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return availableSerials;
    return availableSerials.filter((item) => `${item.serialNo} ${item.batchNo || ""} ${item.expiryDate || ""}`.toLowerCase().includes(keyword));
  }, [availableSerials, searchValue]);

  return (
    <div className="space-y-3" ref={containerRef}>
      <div className="relative">
        <label className="label-rk">{label}</label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setIsOpen((prev) => !prev);
          }}
          className={`input-rk flex items-center justify-between gap-3 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className={selectedSerials.length > 0 ? "truncate text-white" : "truncate text-white/45"}>
            {selectedSerials.length > 0 ? `${selectedSerials.length} serial(s) selected` : "Select existing serial no"}
          </span>
          <span className="shrink-0 text-white/60">▾</span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[160] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
            <div className="border-b border-white/10 p-3">
              <input autoFocus className="input-rk" value={searchValue} onChange={(e) => onSearchValueChange(e.target.value)} placeholder="Search serial no" />
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="rounded-xl px-3 py-3 text-sm text-white/45">No available serial numbers found for the selected product/location.</div>
              ) : (
                filtered.map((serial) => {
                  const selected = selectedSerials.some((value) => value.toUpperCase() === serial.serialNo.toUpperCase());
                  const meta = [serial.batchNo || null, serial.expiryDate ? `Exp ${serial.expiryDate.slice(0, 10)}` : null].filter(Boolean).join(" • ");
                  return (
                    <button
                      key={serial.id}
                      type="button"
                      onClick={() => {
                        onToggle(serial.serialNo);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                        selected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <div>
                        <div className="font-medium">{serial.serialNo}</div>
                        {meta ? <div className="mt-1 text-xs text-white/45">{meta}</div> : null}
                      </div>
                      <div className="text-xs font-semibold">{selected ? "Selected" : "Select"}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>

      {selectedSerials.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedSerials.map((serialNo) => (
            <button key={serialNo} type="button" onClick={() => onToggle(serialNo)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10">
              {serialNo} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`mt-4 flex items-center justify-between gap-4 ${strong ? "text-xl font-bold text-white" : "text-white/75"}`}>
      <span>{label}</span>
      <span className={strong ? "text-white" : "text-white"}>{value}</span>
    </div>
  );
}

function hasActiveInvoiceTransaction(transaction: DeliveryOrderRecord) {
  return (transaction.downstreamLinks || []).some((link) => {
    const target = link.targetTransaction;
    return target && ["INV", "CS"].includes(String(target.docType || "")) && target.status !== "CANCELLED";
  });
}

function hasActiveDeliveryReturnTransaction(transaction: DeliveryOrderRecord) {
  return (transaction.downstreamLinks || []).some((link) => {
    const target = link.targetTransaction;
    return target && target.docType === "DR" && target.status !== "CANCELLED";
  });
}

function isDeliveryOrderLockedByReturn(transaction: DeliveryOrderRecord) {
  return hasActiveDeliveryReturnTransaction(transaction) || getDisplayStatus(transaction) === "RETURNED" || getDisplayStatus(transaction) === "PARTIAL_RETURN";
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
  stockNumberFormat,
  taxConfig,
}: Props) {
  const router = useRouter();
  const qtyDecimalPlaces = getDecimalPlaces(stockNumberFormat.qtyDecimalPlaces, 2);
  const priceDecimalPlaces = getDecimalPlaces(stockNumberFormat.priceDecimalPlaces, 2);
  const qtyInputStep = decimalStep(qtyDecimalPlaces);
  const priceInputStep = decimalStep(priceDecimalPlaces);

  const [transactions, setTransactions] = useState<DeliveryOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<ProductOption[]>(initialProducts);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | "revise">("create");
  const [editTarget, setEditTarget] = useState<DeliveryOrderRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitMessageType, setSubmitMessageType] = useState<"success" | "cancel">("success");
  const [recentCancelledTransaction, setRecentCancelledTransaction] = useState<DeliveryOrderRecord | null>(null);
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

  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState(taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : "");
  const taxCalculationMode = normalizeTaxCalculationMode(taxConfig.taxCalculationMode);
  const isTaxEnabled = Boolean(taxConfig.taxModuleEnabled);
  const isLineItemTaxMode = Boolean(isTaxEnabled && taxCalculationMode === "LINE_ITEM");
  const availableTaxCodes = useMemo(() => taxConfig.taxCodes || [], [taxConfig.taxCodes]);
  const taxCodeOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Tax", searchText: "no tax" },
      ...availableTaxCodes.map((taxCode) => ({
        id: taxCode.id,
        label: taxCode.code,
        searchText: `${taxCode.code} ${taxCode.description} ${taxCode.rate}`.toLowerCase(),
      })),
    ],
    [availableTaxCodes]
  );
  const selectedTaxCode = useMemo(
    () => availableTaxCodes.find((item) => item.id === selectedTaxCodeId) || null,
    [availableTaxCodes, selectedTaxCodeId]
  );
  const [docDesc, setDocDesc] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerAccountNo, setCustomerAccountNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [attention, setAttention] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [deliveryAddressSource, setDeliveryAddressSource] = useState("DEFAULT");
  const [deliveryAddressLine1, setDeliveryAddressLine1] = useState("");
  const [deliveryAddressLine2, setDeliveryAddressLine2] = useState("");
  const [deliveryAddressLine3, setDeliveryAddressLine3] = useState("");
  const [deliveryAddressLine4, setDeliveryAddressLine4] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryPostCode, setDeliveryPostCode] = useState("");
  const [deliveryCountryCode, setDeliveryCountryCode] = useState("MY");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [footerRemarks, setFooterRemarks] = useState("");
  const [lines, setLines] = useState<LineForm[]>([
    emptyLine(
      taxConfig.taxModuleEnabled && normalizeTaxCalculationMode(taxConfig.taxCalculationMode) === "LINE_ITEM" ? taxConfig.defaultAdminTaxCodeId || "" : "",
      defaultLocationId,
      qtyDecimalPlaces,
      priceDecimalPlaces
    ),
  ]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState<Record<string, boolean>>({});
  const [availableBatches, setAvailableBatches] = useState<Record<number, AvailableBatch[]>>({});
  const [loadingBatches, setLoadingBatches] = useState<Record<number, boolean>>({});
  const [availableSerials, setAvailableSerials] = useState<Record<number, AvailableSerial[]>>({});
  const [loadingSerials, setLoadingSerials] = useState<Record<number, boolean>>({});
  const [assemblyTraces, setAssemblyTraces] = useState<Record<number, AssemblyTrace[]>>({});
  const [loadingAssemblyTraces, setLoadingAssemblyTraces] = useState<Record<number, boolean>>({});

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
      products.map((product) => ({
        id: product.id,
        label: `${product.code} — ${product.description}`,
        searchText: `${product.code} ${product.description} ${product.baseUom}`.toLowerCase(),
      })),
    [products]
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

  const selectedCustomer = useMemo(() => initialCustomers.find((item) => item.id === customerId) || null, [customerId, initialCustomers]);

  function isGeneratedFromSalesOrder(transaction: DeliveryOrderRecord) {
    return (transaction.targetLinks || []).some((link) => link.sourceTransaction?.docType === "SO" || String(link.sourceTransaction?.docNo || "").startsWith("SO-"));
  }

  function isGeneratedLineFromSalesOrder(line: LineForm) {
    return Boolean(line.sourceLineId || line.sourceTransactionId);
  }

  const hasGeneratedSalesOrderLines = lines.some((line) => isGeneratedLineFromSalesOrder(line));


  const deliveryAddressOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!selectedCustomer) return [{ id: "DEFAULT", label: "Default Delivery Address", searchText: "default delivery address" }];

    return [
      { id: "DEFAULT", label: "Default Delivery Address", searchText: "default delivery address" },
      ...(selectedCustomer.deliveryAddresses || []).map((address) => {
        const label = address.label?.trim() || "Secondary Delivery Address";
        const addressText = [address.addressLine1, address.addressLine2, address.addressLine3, address.addressLine4, address.postCode, address.city, address.countryCode]
          .filter(Boolean)
          .join(" ");
        return {
          id: address.id,
          label,
          searchText: `${label} ${addressText}`.toLowerCase(),
        };
      }),
    ];
  }, [selectedCustomer]);

  function applyDeliveryAddressFromCustomer(customer: CustomerOption, sourceId = "DEFAULT") {
    if (sourceId === "DEFAULT") {
      setDeliveryAddressSource("DEFAULT");
      setDeliveryAddressLine1(customer.deliveryAddressLine1 || "");
      setDeliveryAddressLine2(customer.deliveryAddressLine2 || "");
      setDeliveryAddressLine3(customer.deliveryAddressLine3 || "");
      setDeliveryAddressLine4(customer.deliveryAddressLine4 || "");
      setDeliveryCity(customer.deliveryCity || "");
      setDeliveryPostCode(customer.deliveryPostCode || "");
      setDeliveryCountryCode(customer.deliveryCountryCode || "MY");
      return;
    }

    const selectedAddress = (customer.deliveryAddresses || []).find((address) => address.id === sourceId);
    if (!selectedAddress) return;

    setDeliveryAddressSource(sourceId);
    setDeliveryAddressLine1(selectedAddress.addressLine1 || "");
    setDeliveryAddressLine2(selectedAddress.addressLine2 || "");
    setDeliveryAddressLine3(selectedAddress.addressLine3 || "");
    setDeliveryAddressLine4(selectedAddress.addressLine4 || "");
    setDeliveryCity(selectedAddress.city || "");
    setDeliveryPostCode(selectedAddress.postCode || "");
    setDeliveryCountryCode(selectedAddress.countryCode || "MY");
  }

  const normalizedLines = useMemo(() => {
    return lines.map((line) => {
      const qty = Math.max(0, Number(line.qty || 0));
      const unitPrice = Math.max(0, Number(line.unitPrice || 0));
      const discountValue = Math.max(0, Number(line.discountRate || 0));
      const discountRate = line.discountType === "PERCENT" ? discountValue : 0;
      const lineSubtotal = roundMoney(qty * unitPrice);
      const discountAmount = line.discountType === "AMOUNT" ? Math.min(lineSubtotal, roundMoney(discountValue)) : roundMoney(lineSubtotal * (discountRate / 100));
      const taxableAmount = Math.max(0, roundMoney(lineSubtotal - discountAmount));
      const lineTaxCode = availableTaxCodes.find((item) => item.id === line.taxCodeId) || null;
      const lineTaxBreakdown = calculateLineItemTaxBreakdown({
        lineTotal: taxableAmount,
        taxRate: lineTaxCode?.rate ?? null,
        calculationMethod: lineTaxCode?.calculationMethod ?? null,
        taxEnabled: Boolean(isTaxEnabled && isLineItemTaxMode && lineTaxCode),
      });

      return {
        ...line,
        qtyNumber: qty,
        lineSubtotal,
        discountAmount,
        taxableAmount,
        lineTaxCode,
        taxAmount: lineTaxBreakdown.taxAmount,
        lineTotal: lineTaxBreakdown.lineGrandTotalAfterTax,
      };
    });
  }, [availableTaxCodes, isLineItemTaxMode, isTaxEnabled, lines]);

  const totals = useMemo(() => {
    const subtotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
    const discountTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.discountAmount, 0));
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
    if (isCreateOpen && formMode === "create" && !docNo) void loadNextDocNo(docDate);
  }, [docDate, isCreateOpen, formMode, docNo]);

  useEffect(() => {
    lines.forEach((line, index) => {
      const product = products.find((item) => item.id === line.inventoryProductId);
      if (!line.inventoryProductId || !line.locationId || !product?.batchTracking) return;
      if (availableBatches[index] !== undefined || loadingBatches[index]) return;

      setLoadingBatches((prev) => ({ ...prev, [index]: true }));
      const params = new URLSearchParams({
        inventoryProductId: line.inventoryProductId,
        locationId: line.locationId,
        direction: "outbound",
      });
      fetch(`/api/admin/stock/batches?${params.toString()}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          setAvailableBatches((prev) => ({ ...prev, [index]: data?.ok && Array.isArray(data.items) ? data.items : [] }));
        })
        .catch(() => setAvailableBatches((prev) => ({ ...prev, [index]: [] })))
        .finally(() => setLoadingBatches((prev) => ({ ...prev, [index]: false })));
    });
  }, [availableBatches, products, lines, loadingBatches]);

  useEffect(() => {
    lines.forEach((line, index) => {
      const product = products.find((item) => item.id === line.inventoryProductId);
      if (!line.inventoryProductId || !line.locationId || !product?.serialNumberTracking) return;
      if (availableSerials[index] !== undefined || loadingSerials[index]) return;

      setLoadingSerials((prev) => ({ ...prev, [index]: true }));
      const params = new URLSearchParams({
        inventoryProductId: line.inventoryProductId,
        locationId: line.locationId,
      });
      if (line.batchNo) params.set("batchNo", line.batchNo);
      fetch(`/api/admin/stock/serials?${params.toString()}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          setAvailableSerials((prev) => ({ ...prev, [index]: data?.ok && Array.isArray(data.serials) ? data.serials : [] }));
        })
        .catch(() => setAvailableSerials((prev) => ({ ...prev, [index]: [] })))
        .finally(() => setLoadingSerials((prev) => ({ ...prev, [index]: false })));
    });
  }, [availableSerials, products, lines, loadingSerials]);

  useEffect(() => {
    lines.forEach((line, index) => {
      const product = products.find((item) => item.id === line.inventoryProductId);
      if (!line.inventoryProductId || !line.locationId || !line.batchNo || !product?.isAssemblyItem) return;
      if (assemblyTraces[index] !== undefined || loadingAssemblyTraces[index]) return;

      setLoadingAssemblyTraces((prev) => ({ ...prev, [index]: true }));
      const params = new URLSearchParams({
        inventoryProductId: line.inventoryProductId,
        locationId: line.locationId,
        batchNo: line.batchNo,
      });
      fetch(`/api/admin/stock/assembly-trace?${params.toString()}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          setAssemblyTraces((prev) => ({ ...prev, [index]: data?.ok && Array.isArray(data.traces) ? data.traces : [] }));
        })
        .catch(() => setAssemblyTraces((prev) => ({ ...prev, [index]: [] })))
        .finally(() => setLoadingAssemblyTraces((prev) => ({ ...prev, [index]: false })));
    });
  }, [assemblyTraces, lines, loadingAssemblyTraces]);

  useEffect(() => {
    lines.forEach((line) => {
      if (!line.inventoryProductId || !line.locationId) return;
      const product = products.find((item) => item.id === line.inventoryProductId);
      if (product?.itemType === "SERVICE_ITEM") return;
      const batchNo = product?.batchTracking ? line.batchNo : "";
      if (product?.batchTracking && !batchNo) return;
      const key = balanceKey(line.inventoryProductId, line.locationId, batchNo);
      if (balances[key] !== undefined || loadingBalances[key]) return;

      setLoadingBalances((prev) => ({ ...prev, [key]: true }));
      const params = new URLSearchParams({ inventoryProductId: line.inventoryProductId, locationId: line.locationId });
      if (batchNo) params.set("batchNo", batchNo);
      fetch(`/api/admin/stock/balance?${params.toString()}`, { cache: "no-store" })
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
  }, [balances, products, lines, loadingBalances]);

  function resetForm() {
    setFormMode("create");
    setEditTarget(null);
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
    setDeliveryAddressSource("DEFAULT");
    setDeliveryAddressLine1("");
    setDeliveryAddressLine2("");
    setDeliveryAddressLine3("");
    setDeliveryAddressLine4("");
    setDeliveryCity("");
    setDeliveryPostCode("");
    setDeliveryCountryCode("MY");
    setReference("");
    setRemarks("");
    setAgentId("");
    setProjectId("");
    setDepartmentId("");
    setTermsAndConditions("");
    setBankAccount("");
    setFooterRemarks("");
    setSelectedTaxCodeId(taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : "");
    setLines([emptyLine(isLineItemTaxMode ? taxConfig.defaultAdminTaxCodeId || "" : "", defaultLocationId, qtyDecimalPlaces, priceDecimalPlaces)]);
    setSubmitError("");
    setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
    setSubmitSuccess("");
    setGenerateFromError("");
    setSelectedSourceOrderIds([]);
    setPickLines([]);
    setBalances({});
    setLoadingBalances({});
    setAvailableBatches({});
    setLoadingBatches({});
    setAvailableSerials({});
    setLoadingSerials({});
    setAssemblyTraces({});
    setLoadingAssemblyTraces({});
  }


  async function loadLatestProducts() {
    try {
      const response = await fetch("/api/admin/products?activeOnly=1&trackInventory=1", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.products)) return;
      setProducts(
        data.products.map((product: any) => ({
          id: product.id,
          code: product.code,
          description: product.description,
          baseUom: product.baseUom,
          itemType: product.itemType === "SERVICE_ITEM" || product.itemType === "NON_STOCK_ITEM" ? product.itemType : "STOCK_ITEM",
          sellingPrice: Number(product.sellingPrice ?? 0),
          batchTracking: Boolean(product.batchTracking),
          serialNumberTracking: Boolean(product.serialNumberTracking),
          isAssemblyItem: Boolean(product.isAssemblyItem),
          uomConversions: Array.isArray(product.uomConversions)
            ? product.uomConversions.map((item: any) => ({
                id: item.id,
                uomCode: item.uomCode,
                conversionRate: Number(item.conversionRate ?? 0),
              }))
            : [],
        }))
      );
    } catch {}
  }

  async function openCreate() {
    await loadLatestProducts();
    resetForm();
    setIsCreateOpen(true);
    await loadNextDocNo(todayInput());
  }

  function fillFormFromTransaction(transaction: DeliveryOrderRecord, mode: "edit" | "revise") {
    setFormMode(mode);
    setEditTarget(transaction);
    setActiveTab("HEADER");
    setDocDate(formatDateInput(transaction.docDate));
    setDocNo(mode === "edit" ? transaction.docNo : "");
    setDocNoDraft(mode === "edit" ? transaction.docNo : "");
    setAutoGeneratedDocNoPreview(mode === "revise" ? buildDeliveryOrderRevisionDocNoPreview(transaction) : transaction.docNo);
    setIsDocNoModalOpen(false);
    setDocDesc(transaction.docDesc || "");
    setCustomerId(transaction.customerId || "");
    setCustomerAccountNo(transaction.customerAccountNo || "");
    setCustomerName(transaction.customerName || "");
    setAttention(transaction.attention || "");
    setContactNo(transaction.contactNo || "");
    setEmail(transaction.email || "");
    setCurrency(transaction.currency || "MYR");
    setDeliveryAddressSource("DEFAULT");
    setDeliveryAddressLine1(transaction.deliveryAddressLine1 || "");
    setDeliveryAddressLine2(transaction.deliveryAddressLine2 || "");
    setDeliveryAddressLine3(transaction.deliveryAddressLine3 || "");
    setDeliveryAddressLine4(transaction.deliveryAddressLine4 || "");
    setDeliveryCity(transaction.deliveryCity || "");
    setDeliveryPostCode(transaction.deliveryPostCode || "");
    setDeliveryCountryCode(transaction.deliveryCountryCode || "MY");
    setReference(transaction.reference || "");
    setRemarks(transaction.remarks || "");
    setAgentId(transaction.agentId || "");
    setProjectId(transaction.projectId || "");
    setDepartmentId(transaction.departmentId || "");
    setTermsAndConditions(transaction.termsAndConditions || "");
    setBankAccount(transaction.bankAccount || "");
    setFooterRemarks(transaction.footerRemarks || "");
    setSelectedTaxCodeId((transaction as any).taxCodeId || (taxConfig.taxModuleEnabled ? taxConfig.defaultAdminTaxCodeId || "" : ""));
    setLines(
      Array.isArray(transaction.lines) && transaction.lines.length > 0
        ? transaction.lines.map((line) => ({
            sourceLineId: "",
            sourceTransactionId: "",
            inventoryProductId: line.inventoryProductId || "",
            productCode: line.productCode || "",
            productDescription: line.productDescription || "",
            itemType: line.itemType === "SERVICE_ITEM" || line.itemType === "NON_STOCK_ITEM" ? line.itemType : "STOCK_ITEM",
            uom: line.uom || "",
            qty: formatDecimalInput(line.qty ?? 1, qtyDecimalPlaces),
            claimAmount: formatDecimalInput(Number(line.qty ?? 0) * Number(line.unitPrice ?? 0), priceDecimalPlaces),
            unitPrice: formatDecimalInput(line.unitPrice ?? 0, priceDecimalPlaces),
            discountRate: formatDecimalInput(line.discountRate ?? 0, priceDecimalPlaces),
            discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
            locationId: line.locationId || defaultLocationId,
            taxCodeId: line.taxCodeId || "",
            batchNo: (line as any).batchNo || "",
            serialNos: uniqueSerialNos(((line as any).serialNos || []) as string[]),
            serialSearch: "",
            remarks: line.remarks || "",
          }))
        : [emptyLine(isLineItemTaxMode ? taxConfig.defaultAdminTaxCodeId || "" : "", defaultLocationId, qtyDecimalPlaces, priceDecimalPlaces)]
    );
    setSubmitError("");
    setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
    setSubmitSuccess("");
    setGenerateFromError("");
    setSelectedSourceOrderIds([]);
    setPickLines([]);
    setIsCreateOpen(true);
  }

  function openEdit(transaction: DeliveryOrderRecord) {
    if (isGeneratedFromSalesOrder(transaction)) {
      setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
      setSubmitSuccess("");
      alert("Delivery Order generated from Sales Order cannot be edited. Please cancel this DO and generate a new DO from the original SO.");
      return;
    }
    fillFormFromTransaction(transaction, "edit");
  }

  function openRevise(transaction: DeliveryOrderRecord) {
    if (isGeneratedFromSalesOrder(transaction)) {
      setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
      setSubmitSuccess("");
      alert("Delivery Order generated from Sales Order cannot be revised. Please cancel this DO and generate a new DO from the original SO.");
      return;
    }
    fillFormFromTransaction(transaction, "revise");
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
    applyDeliveryAddressFromCustomer(customer, "DEFAULT");
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function handleProductChange(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      updateLine(index, { inventoryProductId: "", productCode: "", productDescription: "", itemType: "STOCK_ITEM", uom: "", claimAmount: formatDecimalInput(0, priceDecimalPlaces), unitPrice: formatDecimalInput(0, priceDecimalPlaces), batchNo: "", serialNos: [], serialSearch: "" });
      setAssemblyTraces((prev) => { const next = { ...prev }; delete next[index]; return next; });
      return;
    }
    updateLine(index, {
      inventoryProductId: product.id,
      productCode: product.code,
      productDescription: product.description,
      itemType: product.itemType,
      uom: product.baseUom,
      unitPrice: formatDecimalInput(product.sellingPrice, priceDecimalPlaces),
      locationId: lines[index]?.locationId || defaultLocationId,
      taxCodeId: isLineItemTaxMode ? lines[index]?.taxCodeId || taxConfig.defaultAdminTaxCodeId || "" : "",
      batchNo: "",
      serialNos: [],
      serialSearch: "",
    });
    setAvailableBatches((prev) => { const next = { ...prev }; delete next[index]; return next; });
    setAvailableSerials((prev) => { const next = { ...prev }; delete next[index]; return next; });
    setAssemblyTraces((prev) => { const next = { ...prev }; delete next[index]; return next; });
    setBalances({});
  }

  function openGenerateFromSalesOrder() {
    void loadLatestProducts();
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
        .filter((line) => {
          const itemType = line.itemType === "SERVICE_ITEM" || line.itemType === "NON_STOCK_ITEM" ? line.itemType : "STOCK_ITEM";
          return itemType === "SERVICE_ITEM" ? Number(line.remainingDeliveryAmount || 0) > 0 : Number(line.remainingDeliveryQty || 0) > 0;
        })
        .map((line) => {
          const itemType = line.itemType === "SERVICE_ITEM" || line.itemType === "NON_STOCK_ITEM" ? line.itemType : "STOCK_ITEM";
          const orderedAmount = Number(line.orderedAmount ?? (Number(line.qty || 0) * Number(line.unitPrice || 0)));
          const remainingDeliveryAmount = Number(line.remainingDeliveryAmount ?? orderedAmount);
          return {
            key: `${order.id}-${line.id}`,
            sourceTransactionId: order.id,
            sourceDocNo: order.docNo,
            sourceLineId: line.id,
            inventoryProductId: line.inventoryProductId || "",
            productCode: line.productCode || "",
            productDescription: line.productDescription || "",
            itemType,
            uom: line.uom || "",
            orderedQty: Number(line.qty || 0),
            deliveredQty: Number(line.deliveredQty || 0),
            remainingDeliveryQty: Number(line.remainingDeliveryQty || 0),
            orderedAmount,
            deliveredAmount: Number(line.deliveredAmount || 0),
            remainingDeliveryAmount,
            unitPrice: Number(line.unitPrice || 0),
            discountRate: Number(line.discountRate || 0),
            discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
            locationId: line.locationId || defaultLocationId,
            remarks: line.remarks || "",
            deliverQty: String(Number(line.remainingDeliveryQty || 0)),
            deliverAmount: formatDecimalInput(remainingDeliveryAmount, priceDecimalPlaces),
          };
        })
    );

    setPickLines(nextLines);
    setGenerateFromError("");
  }

  function updatePickLine(key: string, value: string) {
    setPickLines((prev) => prev.map((line) => (line.key === key ? { ...line, deliverQty: value } : line)));
  }

  function updatePickLineAmount(key: string, value: string) {
    setPickLines((prev) => prev.map((line) => (line.key === key ? { ...line, deliverAmount: value } : line)));
  }

  function importPickLines() {
    const validLines = pickLines.filter((line) => line.itemType === "SERVICE_ITEM" ? Number(line.deliverAmount || 0) > 0 : Number(line.deliverQty || 0) > 0);
    if (validLines.length === 0) {
      setGenerateFromError("Please enter delivery qty / claim amount for at least one line.");
      return;
    }
    const overLine = validLines.find((line) =>
      line.itemType === "SERVICE_ITEM"
        ? Number(line.deliverAmount || 0) > line.remainingDeliveryAmount
        : Number(line.deliverQty || 0) > line.remainingDeliveryQty
    );
    if (overLine) {
      setGenerateFromError(
        overLine.itemType === "SERVICE_ITEM"
          ? `${overLine.productCode} claim amount cannot exceed remaining amount.`
          : `${overLine.productCode} delivery qty cannot exceed remaining qty.`
      );
      return;
    }

    const first = selectedSourceOrders[0];
    setDocDate(todayInput());
    setDocNo("");
    setDocNoDraft("");
    setDocDesc(`Generated from ${selectedSourceOrders.map((order) => order.docNo).join(", ")}`);
    setReference(selectedSourceOrders.map((order) => order.docNo).join(", "));
    setRemarks(first?.remarks || "");
    setDeliveryAddressSource("DEFAULT");
    setDeliveryAddressLine1(first?.deliveryAddressLine1 || "");
    setDeliveryAddressLine2(first?.deliveryAddressLine2 || "");
    setDeliveryAddressLine3(first?.deliveryAddressLine3 || "");
    setDeliveryAddressLine4(first?.deliveryAddressLine4 || "");
    setDeliveryCity(first?.deliveryCity || "");
    setDeliveryPostCode(first?.deliveryPostCode || "");
    setDeliveryCountryCode(first?.deliveryCountryCode || "MY");
    setProjectId(first?.projectId || "");
    setDepartmentId(first?.departmentId || "");
    setTermsAndConditions(first?.termsAndConditions || "");
    setBankAccount(first?.bankAccount || "");
    setFooterRemarks(first?.footerRemarks || "");

    setLines(
      validLines.map((line) => {
        const isServiceItem = line.itemType === "SERVICE_ITEM";
        const claimAmount = Number(line.deliverAmount || 0);
        return {
          sourceLineId: line.sourceLineId,
          sourceTransactionId: line.sourceTransactionId,
          inventoryProductId: line.inventoryProductId,
          productCode: line.productCode,
          productDescription: line.productDescription,
          itemType: line.itemType,
          uom: line.uom,
          qty: isServiceItem ? formatDecimalInput(1, qtyDecimalPlaces) : String(line.deliverQty),
          claimAmount: isServiceItem ? formatDecimalInput(claimAmount, priceDecimalPlaces) : formatDecimalInput(Number(line.deliverQty || 0) * line.unitPrice, priceDecimalPlaces),
          unitPrice: isServiceItem ? formatDecimalInput(claimAmount, priceDecimalPlaces) : String(line.unitPrice.toFixed(2)),
          discountRate: isServiceItem ? "0" : String(line.discountRate),
          discountType: isServiceItem ? "AMOUNT" : line.discountType,
          locationId: isServiceItem ? "" : (line.locationId || defaultLocationId),
          taxCodeId: isLineItemTaxMode ? taxConfig.defaultAdminTaxCodeId || "" : "",
          batchNo: "",
          serialNos: [],
          serialSearch: "",
          remarks: line.remarks,
        };
      })
    );

    setIsGenerateFromOpen(false);
    setActiveTab("BODY");
    setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
    setSubmitSuccess(`Imported ${validLines.length} Sales Order line(s). Please review and save the Delivery Order.`);
  }

  function validateDeliveryOrderForm() {
    if (!customerId) return "Customer is required.";
    if (!lines.length) return "Please add at least one product line.";

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.inventoryProductId || !line.productCode) return `Product line ${index + 1} is missing product.`;
      const product = products.find((item) => item.id === line.inventoryProductId);
      const isServiceItem = product?.itemType === "SERVICE_ITEM" || line.itemType === "SERVICE_ITEM";
      if (isServiceItem) {
        if (Number(line.claimAmount || line.unitPrice || 0) <= 0) return `Product line ${index + 1} claim amount must be greater than zero.`;
        continue;
      }
      if (Number(line.qty || 0) <= 0) return `Product line ${index + 1} quantity must be greater than zero.`;
      if (!line.locationId) return `Product line ${index + 1} requires stock location.`;
      if (product?.batchTracking && !line.batchNo) return `Product line ${index + 1} requires Batch No.`;
      if (product?.serialNumberTracking) {
        if (line.serialNos.length === 0) return `Product line ${index + 1} requires S/N No.`;
        if (Number(line.qty || 0) !== line.serialNos.length) return `Product line ${index + 1} quantity must match selected S/N count.`;
      }
    }

    return "";
  }

  const formValidationMessage = validateDeliveryOrderForm();
  const canSubmitDeliveryOrder = !isSubmitting && !formValidationMessage;

  async function submitDeliveryOrder() {
    setSubmitError("");
    setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
    setSubmitSuccess("");
    const validationMessage = validateDeliveryOrderForm();
    if (validationMessage) {
      setSubmitError(validationMessage);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        docDate,
        docNo,
        docDesc,
        customerId,
        currency,
        deliveryAddressLine1,
        deliveryAddressLine2,
        deliveryAddressLine3,
        deliveryAddressLine4,
        deliveryCity,
        deliveryPostCode,
        deliveryCountryCode,
        reference,
        remarks,
        agentId,
        projectId,
        departmentId,
        termsAndConditions,
        bankAccount,
        footerRemarks,
        taxCalculationMode,
        transactionTaxCodeId: isTaxEnabled && !isLineItemTaxMode ? selectedTaxCodeId : "",
        lines: lines.map((line) => ({
          ...line,
          taxCodeId: isTaxEnabled && isLineItemTaxMode ? line.taxCodeId : "",
        })),
      };

      const isUpdateMode = formMode !== "create" && Boolean(editTarget?.id);
      const endpoint = isUpdateMode && editTarget ? `/api/admin/sales/delivery-order/${editTarget.id}` : "/api/admin/sales/delivery-order";
      const requestBody = isUpdateMode ? { ...payload, action: formMode === "revise" ? "revise" : "edit" } : payload;
      const response = await fetch(endpoint, {
        method: isUpdateMode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save delivery order.");

      const successMessage = formMode === "revise" ? "Delivery Order revised successfully." : formMode === "edit" ? "Delivery Order updated successfully." : "Delivery Order created successfully.";
      setIsCreateOpen(false);
      resetForm();
      setSubmitMessageType("success");
    setRecentCancelledTransaction(null);
      setSubmitSuccess(successMessage);
      setBalances({});
      setLoadingBalances({});
      setAvailableBatches({});
      setLoadingBatches({});
      setAvailableSerials({});
      setLoadingSerials({});
      setAssemblyTraces({});
      setLoadingAssemblyTraces({});
      await loadTransactions();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save delivery order.");
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
      setSubmitMessageType("cancel");
      setSubmitSuccess("");
      setRecentCancelledTransaction((data.transaction || { ...cancelTarget, status: "CANCELLED", cancelReason, cancelledAt: new Date().toISOString() }) as DeliveryOrderRecord);
      setBalances({});
      setLoadingBalances({});
      setAvailableBatches({});
      setLoadingBatches({});
      setAvailableSerials({});
      setLoadingSerials({});
      setAssemblyTraces({});
      setLoadingAssemblyTraces({});
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

      {submitSuccess && !isCreateOpen ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            submitMessageType === "cancel"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {submitSuccess}
        </div>
      ) : null}

      {submitMessageType === "cancel" && recentCancelledTransaction && !isCreateOpen ? (
        <CancelledTransactionNotice transaction={recentCancelledTransaction} label={getSalesDocumentLabel(recentCancelledTransaction)} />
      ) : null}

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
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No delivery order found.</td></tr>
              ) : (
                filteredTransactions.map((item) => (
                  <tr key={item.id} onClick={() => router.push(`/admin/sales/delivery-order/${item.id}`)} className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{item.docNo}</div>
                      {item.revisedFrom?.docNo ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (item.revisedFrom?.id) router.push(`/admin/sales/delivery-order/${item.revisedFrom.id}`);
                          }}
                          className="mt-2 rounded-md px-1 py-0.5 text-left text-xs text-white/40 transition hover:bg-white/10 hover:text-white/80"
                        >
                          ↳ Revision of {item.revisedFrom.docNo}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">{item.customerName}</div>
                      <div className="text-xs text-white/45">{item.customerAccountNo || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-white/65">{(item.targetLinks || []).map((link) => link.sourceTransaction?.docNo).filter(Boolean).join(", ") || "-"}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(getDisplayStatus(item))}`}>{getDisplayStatus(item).replace("PARTIAL_RETURN", "PARTIAL RETURN")}</span></td>
                    <td className="px-4 py-4 text-right">{`${item.currency || "MYR"} ${moneyWithPlaces(Number(item.grandTotal || 0), priceDecimalPlaces)}`}</td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== "CANCELLED" ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          {item.status !== "COMPLETED" && !hasActiveInvoiceTransaction(item) && !isGeneratedFromSalesOrder(item) && !isDeliveryOrderLockedByReturn(item) ? (
                            <>
                              <button type="button" onClick={(event) => { event.stopPropagation(); openEdit(item); }} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10 hover:text-white">
                                Edit
                              </button>
                              <button type="button" onClick={(event) => { event.stopPropagation(); openRevise(item); }} className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/10">
                                Edit Revise
                              </button>
                            </>
                          ) : null}
                          {item.status !== "COMPLETED" && !hasActiveInvoiceTransaction(item) && !isDeliveryOrderLockedByReturn(item) ? (
                            <button type="button" onClick={(event) => { event.stopPropagation(); setCancelTarget(item); }} className="rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10">
                              Cancel
                            </button>
                          ) : (
                            <span className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/35" title={hasActiveInvoiceTransaction(item) ? "Cancel the active invoice first." : "Completed document is locked."}>
                              Locked
                            </span>
                          )}
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
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Delivery Order</p>
                <h2 className="mt-3 text-3xl font-bold">{formMode === "revise" ? "Revise Delivery Order" : formMode === "edit" ? "Edit Delivery Order" : "Create Delivery Order"}</h2>
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

            {hasGeneratedSalesOrderLines ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                This Delivery Order is generated from Sales Order. Product, qty, selling price, discount, location, and footer pricing are locked. Batch No and S/N remain selectable for tracked stock items before saving this Delivery Order.
              </div>
            ) : null}
            {generateFromError ? <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{generateFromError}</div> : null}
            {submitError ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
            {submitSuccess ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}

            {activeTab === "HEADER" ? (
              <div className="mt-6 space-y-5">
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
                  <div className="md:col-span-2"><label className="label-rk">Document Description</label><input className="input-rk" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} /></div>
                  <div><label className="label-rk">Attention</label><input className="input-rk" value={attention} onChange={(e) => setAttention(e.target.value)} /></div>
                  <SearchableSelect label="Agent" placeholder="No Agent" options={agentOptions} value={agentId} onChange={(option) => setAgentId(option?.id || "")} />
                  {projectFeatureEnabled ? <SearchableSelect label="Project" placeholder="No Project" options={projectOptions} value={projectId} onChange={(option) => { setProjectId(option?.id || ""); setDepartmentId(""); }} /> : null}
                  {departmentFeatureEnabled ? <SearchableSelect label="Department" placeholder="No Department" options={departmentOptions} value={departmentId} onChange={(option) => setDepartmentId(option?.id || "")} /> : null}
                </div>

                <div className="rounded-[1.75rem] border border-white/10 p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">Delivery Address</p>
                      <p className="mt-2 text-sm text-white/55">Select default or secondary delivery address for this Delivery Order.</p>
                    </div>
                    <div className="w-full md:w-80">
                      <SearchableSelect
                        label="Address Source"
                        placeholder="Select delivery address"
                        options={deliveryAddressOptions}
                        value={deliveryAddressSource}
                        disabled={!customerId}
                        onChange={(option) => {
                          if (!selectedCustomer) return;
                          applyDeliveryAddressFromCustomer(selectedCustomer, option?.id || "DEFAULT");
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div><label className="label-rk">Delivery Address Line 1</label><input className="input-rk" value={deliveryAddressLine1} onChange={(e) => setDeliveryAddressLine1(e.target.value)} /></div>
                    <div><label className="label-rk">Delivery Address Line 2</label><input className="input-rk" value={deliveryAddressLine2} onChange={(e) => setDeliveryAddressLine2(e.target.value)} /></div>
                    <div><label className="label-rk">Delivery Address Line 3</label><input className="input-rk" value={deliveryAddressLine3} onChange={(e) => setDeliveryAddressLine3(e.target.value)} /></div>
                    <div><label className="label-rk">Delivery Address Line 4</label><input className="input-rk" value={deliveryAddressLine4} onChange={(e) => setDeliveryAddressLine4(e.target.value)} /></div>
                    <div><label className="label-rk">City</label><input className="input-rk" value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} /></div>
                    <div><label className="label-rk">Post Code</label><input className="input-rk" value={deliveryPostCode} onChange={(e) => setDeliveryPostCode(e.target.value)} /></div>
                    <div><label className="label-rk">Country Code</label><input className="input-rk" value={deliveryCountryCode} onChange={(e) => setDeliveryCountryCode(e.target.value.toUpperCase())} /></div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className={`mt-6 space-y-5 ${hasGeneratedSalesOrderLines ? "rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 opacity-70 grayscale" : ""}`}>
                {hasGeneratedSalesOrderLines ? (
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/55">
                    Read-only generated body section. This Delivery Order was generated from Sales Order, so product, qty, selling price, discount, location, and line pricing details are locked. Batch No and S/N remain selectable for tracked stock items.
                  </div>
                ) : null}
                {lines.map((line, index) => {
                  const isGeneratedLine = isGeneratedLineFromSalesOrder(line);
                  const normalizedLine = normalizedLines[index];
                  const total = normalizedLine?.lineTotal || 0;
                  const taxAmount = normalizedLine?.taxAmount || 0;
                  const selectedProduct = products.find((item) => item.id === line.inventoryProductId) || null;
                  const uomOptions = selectedProduct
                    ? [
                        {
                          id: selectedProduct.baseUom,
                          label: `${selectedProduct.baseUom} (Base UOM)`,
                          searchText: selectedProduct.baseUom.toLowerCase(),
                        },
                        ...(selectedProduct.uomConversions || [])
                          .filter((item) => item.uomCode && Number(item.conversionRate) > 0)
                          .map((item) => ({
                            id: item.uomCode.toUpperCase(),
                            label: `${item.uomCode.toUpperCase()} (1 = ${item.conversionRate} ${selectedProduct.baseUom})`,
                            searchText: `${item.uomCode} ${selectedProduct.baseUom} ${item.conversionRate}`.toLowerCase(),
                          })),
                      ]
                    : [];
                  const trackingInfo = selectedProduct
                    ? [selectedProduct.batchTracking ? "Batch Tracked" : "", selectedProduct.serialNumberTracking ? "Serial Tracked" : ""].filter(Boolean).join(" • ")
                    : "";
                  return (
                    <div key={index} className="rounded-[1.75rem] border border-white/10 p-5">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-white">Product {index + 1}</h3>
                        {lines.length > 1 && !isGeneratedLine ? <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10">Remove</button> : null}
                      </div>
                      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <div className="md:col-span-2">
                          <SearchableSelect
                            label="Product"
                            placeholder="Search or select product"
                            options={productOptions}
                            value={line.inventoryProductId}
                            disabled={Boolean(line.sourceLineId)}
                            onChange={(option) => handleProductChange(index, option?.id || "")}
                          />
                          {trackingInfo || line.productDescription ? <p className="mt-2 text-xs text-white/45">{trackingInfo || line.productDescription}</p> : null}
                        </div>
                        <SearchableSelect
                          label="UOM"
                          placeholder="Select UOM"
                          options={uomOptions}
                          value={line.uom}
                          disabled={Boolean(line.sourceLineId) || !selectedProduct}
                          onChange={(option) => updateLine(index, { uom: option?.id || selectedProduct?.baseUom || "" })}
                        />
                        <div>
                          <label className="label-rk">Qty</label>
                          <input className="input-rk" type="number" min="0" step={qtyInputStep} value={line.qty} disabled={isGeneratedLine} onChange={(e) => updateLine(index, { qty: limitDecimalInputValue(e.target.value, qtyDecimalPlaces) })} onBlur={(e) => updateLine(index, { qty: normalizeDecimalInputValue(e.target.value, qtyDecimalPlaces) })} />
                        </div>
                        <div>
                          <label className="label-rk">Selling Price</label>
                          <input className="input-rk" type="number" min="0" step={priceInputStep} value={line.unitPrice} disabled={isGeneratedLine} onChange={(e) => updateLine(index, { unitPrice: limitDecimalInputValue(e.target.value, priceDecimalPlaces) })} onBlur={(e) => updateLine(index, { unitPrice: normalizeDecimalInputValue(e.target.value, priceDecimalPlaces) })} />
                        </div>
                        <div>
                          <label className="label-rk">Discount</label>
                          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                            <input className="input-rk" type="number" min="0" step={priceInputStep} value={line.discountRate} disabled={isGeneratedLine} onChange={(e) => updateLine(index, { discountRate: limitDecimalInputValue(e.target.value, priceDecimalPlaces) })} />
                            <CompactSelect options={[{ id: "PERCENT", label: "%", searchText: "percent %" }, { id: "AMOUNT", label: "RM", searchText: "amount rm" }]} value={line.discountType} disabled={isGeneratedLine} onChange={(value) => updateLine(index, { discountType: value === "AMOUNT" ? "AMOUNT" : "PERCENT" })} />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <SearchableSelect
                            label="Location"
                            placeholder="Search or select location"
                            options={locationOptions}
                            value={line.locationId}
                            disabled={isGeneratedLine}
                            onChange={(option) => {
                              updateLine(index, { locationId: option?.id || "", batchNo: "", serialNos: [], serialSearch: "" });
                              setAvailableBatches((prev) => { const next = { ...prev }; delete next[index]; return next; });
                              setAvailableSerials((prev) => { const next = { ...prev }; delete next[index]; return next; });
                              setAssemblyTraces((prev) => { const next = { ...prev }; delete next[index]; return next; });
                              setBalances({});
                            }}
                          />
                          <p className="mt-2 text-xs text-white/45">
                            {selectedProduct?.itemType === "SERVICE_ITEM"
                              ? "Service item claim by amount."
                              : selectedProduct?.batchTracking && !line.batchNo
                              ? "Select Batch No to view batch balance."
                              : getBalanceDisplay(
                                  line.inventoryProductId && line.locationId ? balances[balanceKey(line.inventoryProductId, line.locationId, selectedProduct?.batchTracking ? line.batchNo : "")] : undefined,
                                  line.inventoryProductId && line.locationId ? Boolean(loadingBalances[balanceKey(line.inventoryProductId, line.locationId, selectedProduct?.batchTracking ? line.batchNo : "")]) : false,
                                  qtyDecimalPlaces
                                )}
                          </p>
                        </div>
                        {selectedProduct?.batchTracking ? (
                          <div className="md:col-span-2">
                            <SearchableSelect
                              label="Batch No"
                              placeholder={loadingBatches[index] ? "Loading batches..." : "Select Batch No"}
                              options={(() => {
                                const options = (availableBatches[index] || []).map((batch) => ({
                                  id: batch.batchNo,
                                  label: batchOptionLabel(batch, qtyDecimalPlaces),
                                  searchText: `${batch.batchNo} ${batch.expiryDate || ""}`.toLowerCase(),
                                }));
                                if (line.batchNo && !options.some((option) => option.id.toUpperCase() === line.batchNo.toUpperCase())) {
                                  options.unshift({ id: line.batchNo, label: `${line.batchNo} (Selected)`, searchText: line.batchNo.toLowerCase() });
                                }
                                return options;
                              })()}
                              value={line.batchNo}
                              disabled={!line.inventoryProductId || !line.locationId || Boolean(loadingBatches[index])}
                              onChange={(option) => {
                                updateLine(index, { batchNo: option?.id || "", serialNos: [], serialSearch: "" });
                                setAvailableSerials((prev) => { const next = { ...prev }; delete next[index]; return next; });
                                setAssemblyTraces((prev) => { const next = { ...prev }; delete next[index]; return next; });
                                setBalances({});
                              }}
                            />
                            {line.inventoryProductId && line.locationId && !line.batchNo && !loadingBatches[index] && (availableBatches[index] || []).length === 0 ? (
                              <p className="mt-2 text-xs text-amber-200">No available batch balance found for this product/location.</p>
                            ) : null}
                            {line.batchNo && selectedProduct?.isAssemblyItem ? (
                              <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-semibold">Assembly Trace</div>
                                  {loadingAssemblyTraces[index] ? <div className="text-xs text-sky-100/70">Loading...</div> : null}
                                </div>
                                {!loadingAssemblyTraces[index] && (assemblyTraces[index] || []).length === 0 ? (
                                  <p className="mt-2 text-xs text-sky-100/70">No assembly trace found for this batch.</p>
                                ) : null}
                                {(assemblyTraces[index] || []).map((trace) => (
                                  <div key={trace.id} className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/70">
                                      {trace.docNo || trace.transactionNo}{trace.docDate || trace.transactionDate ? ` • ${formatTraceDate(trace.docDate || trace.transactionDate)}` : ""}
                                    </div>
                                    <div className="mt-3 space-y-2">
                                      {trace.components.length === 0 ? (
                                        <div className="text-xs text-white/45">No raw material component lines found.</div>
                                      ) : (
                                        trace.components.map((component) => (
                                          <div key={component.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                                            <div className="font-medium text-white">{component.productCode} — {component.productDescription}</div>
                                            <div className="mt-1 text-xs text-white/60">{formatTraceLineMeta(component, qtyDecimalPlaces)}</div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {selectedProduct?.serialNumberTracking ? (
                          <div className="md:col-span-2">
                            <OutboundSerialPicker
                              label="S/N No"
                              availableSerials={availableSerials[index] || []}
                              selectedSerials={line.serialNos}
                              searchValue={line.serialSearch}
                              onSearchValueChange={(value) => updateLine(index, { serialSearch: value })}
                              onToggle={(serialNo) => {
                                const exists = line.serialNos.some((item) => item.toUpperCase() === serialNo.toUpperCase());
                                updateLine(index, { serialNos: exists ? line.serialNos.filter((item) => item.toUpperCase() !== serialNo.toUpperCase()) : uniqueSerialNos([...line.serialNos, serialNo]) });
                              }}
                              disabled={!line.inventoryProductId || !line.locationId || (selectedProduct.batchTracking && !line.batchNo) || Boolean(loadingSerials[index])}
                            />
                            {line.inventoryProductId && line.locationId && line.serialNos.length === 0 && (!selectedProduct.batchTracking || line.batchNo) && !loadingSerials[index] && (availableSerials[index] || []).length === 0 ? (
                              <p className="mt-2 text-xs text-amber-200">No available S/N found for this product/location{selectedProduct.batchTracking ? " and batch" : ""}.</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div>
                          <label className="label-rk">Tax Code</label>
                          {isLineItemTaxMode ? (
                            <CompactSelect
                              options={taxCodeOptions}
                              value={line.taxCodeId}
                              onChange={(value) => updateLine(index, { taxCodeId: value })}
                              disabled={isGeneratedLine}
                            />
                          ) : (
                            <input className="input-rk" value={selectedTaxCode?.code || "-"} readOnly />
                          )}
                        </div>
                        <div>
                          <label className="label-rk">Tax Amount</label>
                          <input className="input-rk" value={moneyWithPlaces(taxAmount, priceDecimalPlaces)} readOnly />
                        </div>
                        <div>
                          <label className="label-rk">Gross Amount</label>
                          <input className="input-rk" value={moneyWithPlaces(total, priceDecimalPlaces)} readOnly />
                        </div>
                        <div className="md:col-span-4">
                          <label className="label-rk">Product Remarks</label>
                          <textarea className="input-rk min-h-[90px]" value={line.remarks} disabled={isGeneratedLine} onChange={(e) => updateLine(index, { remarks: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!hasGeneratedSalesOrderLines ? (
                  <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine(isLineItemTaxMode ? taxConfig.defaultAdminTaxCodeId || "" : "", defaultLocationId, qtyDecimalPlaces, priceDecimalPlaces)])} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">+ Add Product</button>
                ) : null}
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className={`mt-6 grid gap-6 lg:grid-cols-[1fr_360px] ${hasGeneratedSalesOrderLines ? "pointer-events-none rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 opacity-70 grayscale" : ""}`}>
                {hasGeneratedSalesOrderLines ? (
                  <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/55">
                    Read-only generated footer section. This Delivery Order was generated from Sales Order, so footer pricing details are locked.
                  </div>
                ) : null}
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
                  <h3 className="text-xl font-semibold text-white">Delivery Order Summary</h3>
                  <SummaryRow label="Subtotal" value={moneyWithPlaces(totals.subtotal, priceDecimalPlaces)} />
                  <SummaryRow label="Discount" value={moneyWithPlaces(totals.discountTotal, priceDecimalPlaces)} />
                  {!isLineItemTaxMode && isTaxEnabled ? (
                    <div className="mt-4">
                      <label className="label-rk">Transaction Tax Code</label>
                      <CompactSelect options={taxCodeOptions} value={selectedTaxCodeId} onChange={setSelectedTaxCodeId} />
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/60">
                    Tax follows Global Settings. Current mode: {isLineItemTaxMode ? "Per Line Item" : "Per Transaction"}.
                  </div>
                  <SummaryRow label="Tax" value={moneyWithPlaces(totals.taxTotal, priceDecimalPlaces)} />
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <SummaryRow label={`Grand Total (${currency || "MYR"})`} value={moneyWithPlaces(totals.grandTotal, priceDecimalPlaces)} strong />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={closeForm} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              <button type="button" disabled={!canSubmitDeliveryOrder} onClick={submitDeliveryOrder} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60">
                {isSubmitting ? "Saving..." : formMode === "revise" ? "Save Revised Delivery Order" : formMode === "edit" ? "Update Delivery Order" : "Create Delivery Order"}
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

            {hasGeneratedSalesOrderLines ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                This Delivery Order is generated from Sales Order. Product, qty, selling price, discount, location, and footer pricing are locked. Batch No and S/N remain selectable for tracked stock items before saving this Delivery Order.
              </div>
            ) : null}
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
                      <th className="px-4 py-3 text-right">Deliver / Claim</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-white/80">
                    {pickLines.map((line) => (
                      <tr key={line.key}>
                        <td className="px-4 py-4">{line.sourceDocNo}</td>
                        <td className="px-4 py-4"><div className="font-semibold text-white">{line.productCode}</div><div className="text-xs text-white/45">{line.productDescription}</div></td>
                        <td className="px-4 py-4 text-right">
                          {line.itemType === "SERVICE_ITEM" ? `${currency} ${moneyWithPlaces(line.orderedAmount, priceDecimalPlaces)}` : moneyWithPlaces(line.orderedQty, qtyDecimalPlaces)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {line.itemType === "SERVICE_ITEM" ? `${currency} ${moneyWithPlaces(line.deliveredAmount, priceDecimalPlaces)}` : moneyWithPlaces(line.deliveredQty, qtyDecimalPlaces)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {line.itemType === "SERVICE_ITEM" ? `${currency} ${moneyWithPlaces(line.remainingDeliveryAmount, priceDecimalPlaces)}` : moneyWithPlaces(line.remainingDeliveryQty, qtyDecimalPlaces)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {line.itemType === "SERVICE_ITEM" ? (
                            <input className="input-rk w-36 text-right" type="number" min="0" max={line.remainingDeliveryAmount} step={priceInputStep} value={line.deliverAmount} onChange={(e) => updatePickLineAmount(line.key, limitDecimalInputValue(e.target.value, priceDecimalPlaces))} />
                          ) : (
                            <input className="input-rk w-32 text-right" type="number" min="0" max={line.remainingDeliveryQty} step={qtyInputStep} value={line.deliverQty} onChange={(e) => updatePickLine(line.key, limitDecimalInputValue(e.target.value, qtyDecimalPlaces))} />
                          )}
                        </td>
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
