
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_STOCK_NUMBER_FORMAT_CONFIG,
  finalizeInputByDecimalPlaces,
  formatNumberByDecimalPlaces,
  isValidInputByDecimalPlaces,
  normalizeStockNumberFormatConfig,
  roundToDecimalPlaces,
} from "@/lib/stock-format";

type StockTransactionTypeValue = "OB" | "SR" | "SI" | "SA" | "ST" | "AS";
type AdjustmentDirectionValue = "IN" | "OUT";

type InventoryProductUomOption = {
  id?: string;
  uomCode: string;
  conversionRate: number;
};

type InventoryProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  unitCost: number;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  uomConversions?: InventoryProductUomOption[];
};

type StockLocationOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type TransactionLineRecord = {
  id: string;
  qty: string | number;
  unitCost?: string | number | null;
  remarks?: string | null;
  adjustmentDirection?: AdjustmentDirectionValue | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  serialEntries?: Array<{ id: string; serialNo: string }>;
  inventoryProduct: {
    id: string;
    code: string;
    description: string;
    baseUom: string;
  };
  location?: { id: string; code: string; name: string } | null;
  fromLocation?: { id: string; code: string; name: string } | null;
  toLocation?: { id: string; code: string; name: string } | null;
};

type TransactionRecord = {
  id: string;
  transactionNo: string;
  docNo?: string | null;
  docDate?: string | null;
  docDesc?: string | null;
  project?: { id: string; code: string; name: string } | null;
  department?: { id: string; code: string; name: string; projectId?: string } | null;
  transactionType: StockTransactionTypeValue;
  transactionDate: string;
  reference?: string | null;
  remarks?: string | null;
  status: "POSTED" | "CANCELLED";
  lines: TransactionLineRecord[];
};

type Props = {
  transactionType: StockTransactionTypeValue;
  title: string;
  intro: string;
  transactionId: string;
  initialTransaction: TransactionRecord;
  initialProducts: InventoryProductOption[];
  initialLocations: StockLocationOption[];
};

type FormLine = {
  inventoryProductId: string;
  qty: string;
  uomCode: string;
  unitCost: string;
  batchNo: string;
  batchMode: "existing" | "new";
  expiryDate: string;
  serialNos: string[];
  serialEntryText: string;
  serialSearch: string;
  remarks: string;
  locationId: string;
  fromLocationId: string;
  toLocationId: string;
  adjustmentDirection: "" | AdjustmentDirectionValue;
  productError?: string;
  qtyError?: string;
  locationError?: string;
  fromLocationError?: string;
  toLocationError?: string;
  batchError?: string;
  serialError?: string;
};

type SearchableSelectOption = {
  id: string;
  label: string;
  searchText: string;
};

type BalanceResponse = {
  ok: boolean;
  balance?: number;
  balances?: Array<{ balance: number }>;
};

type StockSettingsConfig = {
  stockModuleEnabled: boolean;
  multiLocationEnabled: boolean;
  allowNegativeStock: boolean;
  costingMethod: "AVERAGE";
  defaultLocationId: string;
  qtyDecimalPlaces: 0 | 2 | 3;
  unitCostDecimalPlaces: 2 | 3;
  priceDecimalPlaces: 2 | 3;
  allowDocNoOverrideOB?: boolean;
  allowDocNoOverrideSR?: boolean;
  allowDocNoOverrideSI?: boolean;
  allowDocNoOverrideSA?: boolean;
  allowDocNoOverrideST?: boolean;
  allowDocNoOverrideAS?: boolean;
};

type StockSettingsResponse = {
  ok: boolean;
  config?: StockSettingsConfig;
};

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type DepartmentOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  groupId?: string;
  groupLabel?: string | null;
};

type AvailableSerial = {
  id: string;
  serialNo: string;
  batchNo?: string | null;
  expiryDate?: string | null;
};

type AvailableBatch = {
  id: string;
  batchNo: string;
  expiryDate?: string | null;
  balance?: number | null;
};

function requiresSingleLocation(type: StockTransactionTypeValue) {
  return type === "OB" || type === "SR" || type === "SI" || type === "SA" || type === "AS";
}

function formatDateInput(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatQty(value: string | number | null | undefined, decimalPlaces: number) {
  return formatNumberByDecimalPlaces(value, decimalPlaces);
}


function getTypeLabel(type: StockTransactionTypeValue) {
  switch (type) {
    case "OB":
      return "Opening Stock";
    case "SR":
      return "Stock Receive";
    case "SI":
      return "Stock Issue";
    case "SA":
      return "Stock Adjustment";
    case "ST":
      return "Stock Transfer";
    case "AS":
      return "Stock Assembly";
    default:
      return type;
  }
}

function canOverrideDocNoForType(config: StockSettingsConfig, type: StockTransactionTypeValue) {
  switch (type) {
    case "OB":
      return Boolean(config.allowDocNoOverrideOB);
    case "SR":
      return Boolean(config.allowDocNoOverrideSR);
    case "SI":
      return Boolean(config.allowDocNoOverrideSI);
    case "SA":
      return Boolean(config.allowDocNoOverrideSA);
    case "ST":
      return Boolean(config.allowDocNoOverrideST);
    case "AS":
      return Boolean(config.allowDocNoOverrideAS);
    default:
      return false;
  }
}

function normalizeDocNoInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").slice(0, 30);
}

function buildAutoGeneratedDocNoPreview(
  transactionType: StockTransactionTypeValue,
  value: string,
  transactions: Array<{ docNo?: string | null; transactionNo?: string | null }>
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Auto Generated";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const prefix = `${transactionType}-${y}${m}${d}`;
  let maxSeq = 0;
  for (const item of transactions) {
    const effectiveDocNo = String(item.docNo || item.transactionNo || "");
    const match = effectiveDocNo.match(new RegExp(`^${prefix}-(\\d{4})$`));
    if (!match) continue;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
}

function getBackHref(type: StockTransactionTypeValue) {
  switch (type) {
    case "OB":
      return "/admin/stock/opening-stock";
    case "SR":
      return "/admin/stock/stock-receive";
    case "SI":
      return "/admin/stock/stock-issue";
    case "SA":
      return "/admin/stock/stock-adjustment";
    case "ST":
      return "/admin/stock/stock-transfer";
    case "AS":
      return "/admin/stock/stock-assembly";
    default:
      return "/admin/stock/opening-stock";
  }
}


function balanceKey(productId: string, locationId: string, batchNo?: string) {
  return `${productId}__${locationId}__${(batchNo || "").trim().toUpperCase()}`;
}

function uniqueSerialNos(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const key = value.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }
  return next;
}

function getProductUomOptions(product: InventoryProductOption | null | undefined) {
  if (!product) return [];
  const seen = new Set<string>();
  const options: Array<{ id: string; label: string; searchText: string; uomCode: string; conversionRate: number }> = [];
  const pushOption = (uomCode: string, conversionRate: number) => {
    const normalized = String(uomCode || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push({
      id: normalized,
      label: normalized === product.baseUom ? `${normalized} (Base UOM)` : `${normalized} (1 = ${conversionRate} ${product.baseUom})`,
      searchText: `${normalized} ${product.baseUom}`.toLowerCase(),
      uomCode: normalized,
      conversionRate,
    });
  };

  pushOption(product.baseUom, 1);
  for (const item of product.uomConversions || []) {
    if (Number(item.conversionRate) > 0) {
      pushOption(item.uomCode, Number(item.conversionRate));
    }
  }
  return options;
}

function getUomConversionRate(product: InventoryProductOption | null | undefined, uomCode: string | null | undefined) {
  if (!product) return 1;
  const normalized = String(uomCode || product.baseUom).trim().toUpperCase();
  if (!normalized || normalized === product.baseUom) return 1;
  const matched = (product.uomConversions || []).find((item) => item.uomCode.toUpperCase() === normalized);
  return matched && Number(matched.conversionRate) > 0 ? Number(matched.conversionRate) : 1;
}

function convertQtyToBase(product: InventoryProductOption | null | undefined, qty: string | number | null | undefined, uomCode: string | null | undefined) {
  const numericQty = Number(qty ?? 0);
  if (!Number.isFinite(numericQty) || numericQty <= 0) return 0;
  const rate = getUomConversionRate(product, uomCode);
  return roundToDecimalPlaces(numericQty * rate, 3);
}

function normalizeSerialToken(token: string) {
  return token.trim();
}

function parseSerialEntryText(value: string) {
  return value
    .split(/[\n,]+/)
    .map(normalizeSerialToken)
    .filter(Boolean);
}

function isInboundSerialFlow(type: StockTransactionTypeValue, direction: "" | AdjustmentDirectionValue) {
  return type === "OB" || type === "SR" || (type === "SA" && direction === "IN") || (type === "AS" && direction === "IN");
}

function isOutboundSerialFlow(type: StockTransactionTypeValue, direction: "" | AdjustmentDirectionValue) {
  return type === "SI" || type === "ST" || (type === "SA" && direction === "OUT") || (type === "AS" && direction === "OUT");
}

function requiresBatchSelectionBeforeBalance(
  product: InventoryProductOption | null | undefined,
  type: StockTransactionTypeValue,
  direction: "" | AdjustmentDirectionValue
) {
  if (!product?.batchTracking) return false;
  return type === "SI" || type === "ST" || type === "OB" || type === "SR" || (type === "SA" && direction === "OUT") || (type === "SA" && direction === "IN") || (type === "AS" && direction === "OUT") || (type === "AS" && direction === "IN");
}


function getFieldErrorClass(_error?: string) {
  return "";
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
        className={`input-rk flex items-center justify-between gap-3 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="shrink-0 text-white/60">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[120] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
          <div className="border-b border-white/10 p-3">
            <input autoFocus className="input-rk" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} />
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
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return availableSerials;
    return availableSerials.filter((item) => {
      const labelText = `${item.serialNo} ${item.batchNo || ""} ${item.expiryDate || ""}`.toLowerCase();
      return labelText.includes(keyword);
    });
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
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
            <div className="border-b border-white/10 p-3">
              <input
                autoFocus
                className="input-rk"
                value={searchValue}
                onChange={(e) => onSearchValueChange(e.target.value)}
                placeholder="Search serial no"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="rounded-xl px-3 py-3 text-sm text-white/45">No available serial numbers found for the selected product/location.</div>
              ) : (
                filtered.map((serial) => {
                  const selected = selectedSerials.some((value) => value.toUpperCase() === serial.serialNo.toUpperCase());
                  const meta = [serial.batchNo || null, serial.expiryDate ? `Exp ${serial.expiryDate}` : null]
                    .filter(Boolean)
                    .join(" • ");

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
            <button
              key={serialNo}
              type="button"
              onClick={() => onToggle(serialNo)}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
            >
              {serialNo} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildInitialLines(transaction: TransactionRecord, stockSettings: StockSettingsConfig = { stockModuleEnabled: false, multiLocationEnabled: true, allowNegativeStock: false, costingMethod: "AVERAGE", defaultLocationId: "", ...DEFAULT_STOCK_NUMBER_FORMAT_CONFIG }): FormLine[] {
  return transaction.lines.map((line) => ({
    inventoryProductId: line.inventoryProduct.id,
    qty: formatQty(line.qty, stockSettings.qtyDecimalPlaces),
    unitCost: line.unitCost == null ? formatNumberByDecimalPlaces(0, stockSettings.unitCostDecimalPlaces) : formatQty(line.unitCost, stockSettings.unitCostDecimalPlaces),
    uomCode: line.inventoryProduct.baseUom,
    batchNo: line.batchNo || "",
    batchMode: "existing",
    expiryDate: line.expiryDate ? formatDateInput(line.expiryDate) : "",
    serialNos: uniqueSerialNos((line.serialEntries || []).map((item) => item.serialNo)),
    serialEntryText: "",
    serialSearch: "",
    remarks: line.remarks || "",
    locationId: line.location?.id || "",
    fromLocationId: line.fromLocation?.id || "",
    toLocationId: line.toLocation?.id || "",
    adjustmentDirection: line.adjustmentDirection || "",
    productError: "",
    qtyError: "",
    locationError: "",
    fromLocationError: "",
    toLocationError: "",
    batchError: "",
    serialError: "",
  }));
}

export function AdminStockTransactionEditClient({
  transactionType,
  title,
  intro,
  transactionId,
  initialTransaction,
  initialProducts,
  initialLocations,
}: Props) {
  const router = useRouter();
  const [transactionDate, setTransactionDate] = useState(formatDateInput(initialTransaction.transactionDate));
  const [docDate, setDocDate] = useState(formatDateInput(initialTransaction.docDate || initialTransaction.transactionDate));
  const [docNo, setDocNo] = useState(initialTransaction.docNo || "");
  const [docDesc, setDocDesc] = useState(initialTransaction.docDesc || "");
  const [projectId, setProjectId] = useState(initialTransaction.project?.id || "");
  const [departmentId, setDepartmentId] = useState(initialTransaction.department?.id || "");
  const [isDocNoModalOpen, setIsDocNoModalOpen] = useState(false);
  const [docNoDraft, setDocNoDraft] = useState(initialTransaction.docNo || "");
  const [reference, setReference] = useState(initialTransaction.reference || "");
  const [remarks, setRemarks] = useState(initialTransaction.remarks || "");
  const [lines, setLines] = useState<FormLine[]>(() => buildInitialLines(initialTransaction));
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState<Record<string, boolean>>({});
  const [availableSerials, setAvailableSerials] = useState<Record<number, AvailableSerial[]>>({});
  const [loadingSerials, setLoadingSerials] = useState<Record<number, boolean>>({});
  const [availableBatches, setAvailableBatches] = useState<Record<number, AvailableBatch[]>>({});
  const [loadingBatches, setLoadingBatches] = useState<Record<number, boolean>>({});
  const [stockSettings, setStockSettings] = useState<StockSettingsConfig>({
    stockModuleEnabled: false,
    multiLocationEnabled: true,
    allowNegativeStock: false,
    costingMethod: "AVERAGE",
    defaultLocationId: "",
    qtyDecimalPlaces: DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.qtyDecimalPlaces,
    unitCostDecimalPlaces: DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.unitCostDecimalPlaces,
    priceDecimalPlaces: DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.priceDecimalPlaces,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);

  const activeLocations = useMemo(() => initialLocations.filter((item) => item.isActive), [initialLocations]);

  const productOptions = useMemo<SearchableSelectOption[]>(() => initialProducts.map((product) => ({
    id: product.id,
    label: `${product.code} — ${product.description}`,
    searchText: `${product.code} ${product.description} ${product.baseUom}`.toLowerCase(),
  })), [initialProducts]);

  const locationOptions = useMemo<SearchableSelectOption[]>(() => activeLocations.map((location) => ({
    id: location.id,
    label: `${location.code} — ${location.name}`,
    searchText: `${location.code} ${location.name}`.toLowerCase(),
  })), [activeLocations]);

  const canOverrideDocNo = canOverrideDocNoForType(stockSettings, transactionType);
  const autoGeneratedDocNoPreview = useMemo(
    () => buildAutoGeneratedDocNoPreview(transactionType, docDate || transactionDate, [initialTransaction]),
    [transactionType, docDate, transactionDate, initialTransaction]
  );
  const filteredDepartmentOptions = useMemo(
    () => (projectId ? departmentOptions.filter((item) => item.groupId === projectId && item.isActive) : []),
    [departmentOptions, projectId]
  );

  const singleLocationMode = stockSettings.stockModuleEnabled && !stockSettings.multiLocationEnabled && !!stockSettings.defaultLocationId;
  const lockedLocationId = singleLocationMode ? stockSettings.defaultLocationId : "";

  const defaultCreateLocationId = transactionType !== "ST" ? stockSettings.defaultLocationId || "" : "";

  useEffect(() => {
    let cancelled = false;
    async function loadStockSettings() {
      try {
        const response = await fetch("/api/admin/settings/stock", { cache: "no-store" });
        const data = (await response.json()) as StockSettingsResponse;
        if (!response.ok || !data.ok || cancelled) return;
        setStockSettings({
          stockModuleEnabled: Boolean(data.config?.stockModuleEnabled),
          multiLocationEnabled: Boolean(data.config?.multiLocationEnabled),
          allowNegativeStock: Boolean(data.config?.allowNegativeStock),
          costingMethod: "AVERAGE",
          defaultLocationId: data.config?.defaultLocationId || "",
          allowDocNoOverrideOB: Boolean(data.config?.allowDocNoOverrideOB),
          allowDocNoOverrideSR: Boolean(data.config?.allowDocNoOverrideSR),
          allowDocNoOverrideSI: Boolean(data.config?.allowDocNoOverrideSI),
          allowDocNoOverrideSA: Boolean(data.config?.allowDocNoOverrideSA),
          allowDocNoOverrideST: Boolean(data.config?.allowDocNoOverrideST),
          allowDocNoOverrideAS: Boolean(data.config?.allowDocNoOverrideAS),
          ...normalizeStockNumberFormatConfig(data.config),
        });
      } catch {
        if (!cancelled) {
          setStockSettings({ stockModuleEnabled: false, multiLocationEnabled: true, allowNegativeStock: false, costingMethod: "AVERAGE", defaultLocationId: "", ...DEFAULT_STOCK_NUMBER_FORMAT_CONFIG });
        }
      }
    }
    void loadStockSettings();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectDepartmentOptions() {
      try {
        const [projectRes, departmentRes] = await Promise.all([
          fetch("/api/admin/misc-projects", { cache: "no-store" }),
          fetch("/api/admin/misc-departments", { cache: "no-store" }),
        ]);
        const projectData = await projectRes.json();
        const departmentData = await departmentRes.json();
        if (cancelled) return;
        setProjectOptions(Array.isArray(projectData.items) ? projectData.items : []);
        setDepartmentOptions(Array.isArray(departmentData.items) ? departmentData.items : []);
      } catch {
        if (!cancelled) {
          setProjectOptions([]);
          setDepartmentOptions([]);
        }
      }
    }

    void loadProjectDepartmentOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (departmentId && !filteredDepartmentOptions.some((item) => item.id === departmentId)) {
      setDepartmentId("");
    }
  }, [departmentId, filteredDepartmentOptions]);

  useEffect(() => {
    if (!singleLocationMode || !lockedLocationId) return;
    setLines((prev) => prev.map((line) => transactionType === "ST" ? line : { ...line, locationId: line.locationId || lockedLocationId }));
  }, [singleLocationMode, lockedLocationId, transactionType]);

  useEffect(() => {
    const needed = new Set<string>();
    for (const line of lines) {
      const product = initialProducts.find((item) => item.id === line.inventoryProductId);
      const requiresBatch = requiresBatchSelectionBeforeBalance(product, transactionType, line.adjustmentDirection);
      const normalizedBatchNo = product?.batchTracking ? line.batchNo.trim().toUpperCase() : "";
      if (requiresBatch && !normalizedBatchNo) continue;
      if (line.inventoryProductId && line.locationId) needed.add(balanceKey(line.inventoryProductId, line.locationId, normalizedBatchNo));
      if (line.inventoryProductId && line.fromLocationId) needed.add(balanceKey(line.inventoryProductId, line.fromLocationId, normalizedBatchNo));
      if (line.inventoryProductId && line.toLocationId) needed.add(balanceKey(line.inventoryProductId, line.toLocationId, normalizedBatchNo));
    }
    const targets = Array.from(needed);
    if (targets.length === 0) return;
    let cancelled = false;
    setLoadingBalances((prev) => {
      const next = { ...prev };
      for (const key of targets) next[key] = true;
      return next;
    });
    async function fetchBalance(key: string) {
      const [inventoryProductId, locationId, batchNo] = key.split("__");
      try {
        const params = new URLSearchParams({ inventoryProductId, locationId });
        if (batchNo) params.set("batchNo", batchNo);
        const response = await fetch(`/api/admin/stock/balance?${params.toString()}`, { method: "GET", cache: "no-store" });
        const data = (await response.json()) as BalanceResponse;
        if (cancelled) return;
        let resolvedBalance = 0;
        if (response.ok && data.ok) {
          if (typeof data.balance === "number") resolvedBalance = Number(data.balance);
          else if (Array.isArray(data.balances) && data.balances.length > 0) resolvedBalance = Number(data.balances[0]?.balance ?? 0);
        }
        setBalances((prev) => ({ ...prev, [key]: resolvedBalance }));
      } catch {
        if (!cancelled) setBalances((prev) => ({ ...prev, [key]: 0 }));
      } finally {
        if (!cancelled) setLoadingBalances((prev) => ({ ...prev, [key]: false }));
      }
    }
    targets.forEach((key) => { void fetchBalance(key); });
    return () => { cancelled = true; };
  }, [lines, initialProducts, transactionType]);

  useEffect(() => {
    lines.forEach((line, index) => {
      const product = initialProducts.find((item) => item.id === line.inventoryProductId);
      const outboundBatchFlow = transactionType === "SI" || transactionType === "ST" || (transactionType === "SA" && line.adjustmentDirection === "OUT");
      const locationId = transactionType === "ST" ? line.fromLocationId : line.locationId;
      const shouldFetch = !!product?.batchTracking && !!line.inventoryProductId && !!locationId;
      if (!shouldFetch) {
        setAvailableBatches((prev) => ({ ...prev, [index]: [] }));
        setLoadingBatches((prev) => ({ ...prev, [index]: false }));
        return;
      }
      const params = new URLSearchParams({ inventoryProductId: line.inventoryProductId, locationId, direction: outboundBatchFlow ? "outbound" : "inbound" });
      setLoadingBatches((prev) => ({ ...prev, [index]: true }));
      fetch(`/api/admin/stock/batches?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.ok) return [];
          return Array.isArray(data.items) ? data.items : [];
        })
        .then((rows: AvailableBatch[]) => {
          const merged = [...rows];
          if (line.batchNo && !merged.some((entry) => entry.batchNo.toUpperCase() === line.batchNo.toUpperCase())) {
            merged.unshift({ id: `current-${line.batchNo}`, batchNo: line.batchNo, expiryDate: line.expiryDate || null });
          }
          setAvailableBatches((prev) => ({ ...prev, [index]: merged }));
        })
        .finally(() => {
          setLoadingBatches((prev) => ({ ...prev, [index]: false }));
        });
    });
  }, [lines, transactionType, initialProducts]);

  useEffect(() => {
    lines.forEach((line, index) => {
      const product = initialProducts.find((item) => item.id === line.inventoryProductId);
      const shouldFetch = !!product?.serialNumberTracking && isOutboundSerialFlow(transactionType, line.adjustmentDirection) && !!line.inventoryProductId && !!(transactionType === "ST" ? line.fromLocationId : line.locationId) && (!product.batchTracking || !!line.batchNo.trim());
      if (!shouldFetch) {
        setAvailableSerials((prev) => ({ ...prev, [index]: line.serialNos.map((serialNo) => ({ id: `current-${serialNo}`, serialNo, batchNo: line.batchNo || null })) }));
        return;
      }
      const locationId = transactionType === "ST" ? line.fromLocationId : line.locationId;
      const params = new URLSearchParams({ inventoryProductId: line.inventoryProductId, locationId });
      if (product?.batchTracking && line.batchNo.trim()) params.set("batchNo", line.batchNo.trim().toUpperCase());
      setLoadingSerials((prev) => ({ ...prev, [index]: true }));
      fetch(`/api/admin/stock/serials?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.ok) return [];
          return Array.isArray(data.serials) ? data.serials : [];
        })
        .then((rows: AvailableSerial[]) => {
          const merged = [...rows];
          for (const serialNo of line.serialNos) {
            if (!merged.some((entry) => entry.serialNo.toUpperCase() == serialNo.toUpperCase())) {
              merged.unshift({ id: `current-${serialNo}`, serialNo, batchNo: line.batchNo || null });
            }
          }
          setAvailableSerials((prev) => ({ ...prev, [index]: merged }));
        })
        .finally(() => setLoadingSerials((prev) => ({ ...prev, [index]: false })));
    });
  }, [lines, transactionType, initialProducts]);

  function updateLine(index: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      const product = initialProducts.find((item) => item.id === next.inventoryProductId);
      if (product?.serialNumberTracking) {
        next.qty = formatQty(next.serialNos.length || 0, stockSettings.qtyDecimalPlaces);
        next.uomCode = product.baseUom;
      }
      return next;
    }));
  }

  function handleProductChange(index: number, productId: string) {
    const product = initialProducts.find((item) => item.id === productId);
    updateLine(index, {
      inventoryProductId: productId,
      unitCost: product ? formatNumberByDecimalPlaces(product.unitCost, stockSettings.unitCostDecimalPlaces) : formatNumberByDecimalPlaces(0, stockSettings.unitCostDecimalPlaces),
      uomCode: product?.baseUom || "",
      batchNo: "",
      batchMode: "existing",
      expiryDate: "",
      serialNos: [],
      serialEntryText: "",
      serialSearch: "",
      locationId: defaultCreateLocationId || lines[index]?.locationId || "",
      qty: product?.serialNumberTracking ? "0.00" : "1.00",
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { inventoryProductId: "", qty: "1.00", uomCode: "", unitCost: "0.00", batchNo: "", batchMode: "existing", expiryDate: "", serialNos: [], serialEntryText: "", serialSearch: "", remarks: "", locationId: defaultCreateLocationId || "", fromLocationId: "", toLocationId: "", adjustmentDirection: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function getBalanceText(productId: string, locationId: string, batchNo?: string, product?: InventoryProductOption | null, direction: "" | AdjustmentDirectionValue = "") {
    if (!productId || !locationId) return "Select product and location to view balance.";
    if (requiresBatchSelectionBeforeBalance(product, transactionType, direction) && !batchNo?.trim()) return "Select batch no to view balance.";
    const key = balanceKey(productId, locationId, batchNo);
    if (loadingBalances[key]) return "Loading current balance...";
    return `Current Balance: ${formatQty(typeof balances[key] === "number" ? balances[key] : 0, stockSettings.qtyDecimalPlaces)}`;
  }

  function toggleSelectedSerial(index: number, serialNo: string) {
    const line = lines[index];
    const exists = line.serialNos.some((value) => value.toUpperCase() === serialNo.toUpperCase());
    const nextSerials = exists ? line.serialNos.filter((value) => value.toUpperCase() !== serialNo.toUpperCase()) : [...line.serialNos, serialNo];
    const uniqueNext = uniqueSerialNos(nextSerials);
    updateLine(index, { serialNos: uniqueNext, qty: formatQty(uniqueNext.length, stockSettings.qtyDecimalPlaces) });
  }

  function removeInboundSerial(index: number, serialNo: string) {
    const nextSerials = lines[index].serialNos.filter((value) => value.toUpperCase() !== serialNo.toUpperCase());
    updateLine(index, { serialNos: nextSerials, qty: formatQty(nextSerials.length, stockSettings.qtyDecimalPlaces) });
  }

  function setInboundBatch(index: number, value: string) {
    const line = lines[index];
    const normalized = value.trim().toUpperCase();
    if (normalized === "__NEW__") {
      updateLine(index, { batchMode: "new", batchNo: "", expiryDate: "", serialSearch: "" });
      return;
    }
    const matched = (availableBatches[index] || []).find((item) => item.batchNo.toUpperCase() === normalized) || null;
    updateLine(index, {
      batchMode: "existing",
      batchNo: matched?.batchNo || normalized,
      expiryDate: matched?.expiryDate ? formatDateInput(matched.expiryDate) : line.expiryDate,
      serialSearch: "",
    });
  }

  function setInboundNewBatchValue(index: number, value: string) {
    updateLine(index, { batchMode: "new", batchNo: value.trim().toUpperCase(), serialSearch: "" });
  }

  function setOutboundBatch(index: number, batchNo: string) {
    const matched = (availableBatches[index] || []).find((item) => item.batchNo.toUpperCase() === batchNo.toUpperCase()) || null;
    updateLine(index, {
      batchMode: "existing",
      batchNo,
      expiryDate: matched?.expiryDate ? formatDateInput(matched.expiryDate) : "",
      serialSearch: "",
    });
  }

  function addInboundSerial(index: number, serialNo: string) {
    const normalized = serialNo.trim().toUpperCase();
    if (!normalized) return;
    const nextSerials = uniqueSerialNos([...(lines[index]?.serialNos || []), normalized]);
    updateLine(index, { serialNos: nextSerials, serialEntryText: "", qty: formatQty(nextSerials.length, stockSettings.qtyDecimalPlaces) });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const payload = {
        transactionType,
        transactionDate: docDate,
        docDate,
        docNo: docNo.trim() || null,
        docDesc: docDesc.trim() || null,
        projectId: projectId || null,
        departmentId: departmentId || null,
        reference: reference.trim() || null,
        remarks: remarks.trim() || null,
        lines: lines.map((line) => ({
          inventoryProductId: line.inventoryProductId || null,
          qty: Number(line.qty || 0),
          uomCode: line.uomCode || null,
          unitCost: line.unitCost.trim() ? Number(line.unitCost) : null,
          batchNo: line.batchNo.trim().toUpperCase() || null,
          expiryDate: line.expiryDate || null,
          serialNos: line.serialNos,
          remarks: line.remarks.trim() || null,
          locationId: line.locationId || null,
          fromLocationId: line.fromLocationId || null,
          toLocationId: line.toLocationId || null,
          adjustmentDirection: line.adjustmentDirection || null,
        })),
      };
      const response = await fetch(`/api/admin/stock/transactions/${transactionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || `Unable to update ${title.toLowerCase()}.`);
        return;
      }
      setSubmitSuccess(`${title} updated successfully.`);
      router.push(`/admin/stock/transactions/${data.transaction.id}`);
    } catch {
      setSubmitError(`Unable to update ${title.toLowerCase()} right now.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">{getTypeLabel(transactionType)}</p>
        <h3 className="mt-3 text-2xl font-bold text-white">Edit {title}</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{intro}</p>
        <p className="mt-3 text-sm text-white/50">Original Internal Transaction No: {initialTransaction.transactionNo}</p>
        <p className="mt-1 text-sm text-white/50">Current Document No: {initialTransaction.docNo || initialTransaction.transactionNo}</p>
      </div>

      {isDocNoModalOpen ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Manual Document No</p>
            <h3 className="mt-3 text-2xl font-bold text-white">Override Document No</h3>
            <p className="mt-3 text-sm text-white/65">Leave empty to use the auto generated document number. Maximum 30 characters.</p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="label-rk">Auto Generated Preview</label>
                <div className="input-rk flex items-center text-white/80">{autoGeneratedDocNoPreview}</div>
              </div>
              <div>
                <label className="label-rk">Custom Document No</label>
                <input className="input-rk" value={docNoDraft} onChange={(e) => setDocNoDraft(normalizeDocNoInput(e.target.value))} placeholder="Enter custom document no" maxLength={30} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setIsDocNoModalOpen(false)} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Cancel</button>
              <button type="button" onClick={() => { setDocNo(docNoDraft.trim()); setIsDocNoModalOpen(false); }} className="rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400">OK</button>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label-rk">Transaction Date</label>
            <input type="date" className="input-rk" value={formatDateInput(transactionDate)} onChange={(e) => setTransactionDate(e.target.value)} required />
          </div>
          <div>
            <label className="label-rk">Document Date</label>
            <input type="date" className="input-rk" value={formatDateInput(docDate)} onChange={(e) => setDocDate(e.target.value)} required />
          </div>
          <div className="xl:col-span-2">
            <label className="label-rk">System Doc No</label>
            <button
              type="button"
              onClick={() => {
                if (!canOverrideDocNo) return;
                setDocNoDraft(docNo || "");
                setIsDocNoModalOpen(true);
              }}
              disabled={!canOverrideDocNo}
              className={`input-rk flex w-full items-center justify-between gap-3 text-left ${canOverrideDocNo ? "" : "cursor-not-allowed opacity-70"}`}
            >
              <span className="truncate text-white">{docNo || autoGeneratedDocNoPreview}</span>
              <span className="shrink-0 text-xs text-white/50">{canOverrideDocNo ? "Click to override" : "Auto only"}</span>
            </button>
          </div>
          <div className="xl:col-span-2">
            <label className="label-rk">Document Description</label>
            <input className="input-rk" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} placeholder="Optional document description" />
          </div>
          <div>
            <label className="label-rk">Project</label>
            <div className="relative">
              <select className="input-rk appearance-none pr-12" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select project</option>
                {projectOptions.filter((item) => item.isActive).map((item) => (
                  <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
          </div>
          <div>
            <label className="label-rk">Department</label>
            <div className="relative">
              <select className={`input-rk appearance-none pr-12 ${!projectId ? "cursor-not-allowed opacity-60" : ""}`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!projectId}>
                <option value="">Select department</option>
                {filteredDepartmentOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
          </div>
          <div>
            <label className="label-rk">Reference</label>
            <input className="input-rk" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional reference" />
          </div>
          <div>
            <label className="label-rk">Remarks</label>
            <input className="input-rk" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional remarks" />
          </div>
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => {
            const selectedProduct = initialProducts.find((item) => item.id === line.inventoryProductId) || null;
            const uomOptions = getProductUomOptions(selectedProduct);
            const isBatchTracked = !!selectedProduct?.batchTracking;
            const isSerialTracked = !!selectedProduct?.serialNumberTracking;
            const inboundSerialFlow = isInboundSerialFlow(transactionType, line.adjustmentDirection);
            const outboundSerialFlow = isOutboundSerialFlow(transactionType, line.adjustmentDirection);
            const inboundBatchFlow = transactionType === "OB" || transactionType === "SR" || (transactionType === "SA" && line.adjustmentDirection === "IN");
            const outboundBatchFlow = transactionType === "SI" || transactionType === "ST" || (transactionType === "SA" && line.adjustmentDirection === "OUT");
            const serialRows = availableSerials[index] || [];
            const filteredSerialRows = serialRows.filter((entry) => !line.serialSearch.trim() || entry.serialNo.toLowerCase().includes(line.serialSearch.trim().toLowerCase()));
            const balanceBatchNo = isBatchTracked ? line.batchNo.trim().toUpperCase() : "";

            return (
              <div key={index} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Product {index + 1}</div>
                  {lines.length > 1 ? (
                    <button type="button" onClick={() => removeLine(index)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15">Remove</button>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="xl:col-span-2">
                    <SearchableSelect label="Product" placeholder="Search or select product" options={productOptions} value={line.inventoryProductId} onChange={(option) => handleProductChange(index, option?.id || "")} />
                    <p className="mt-2 text-xs text-white/45">{selectedProduct ? `UOM: ${selectedProduct.baseUom}${isBatchTracked ? " • Batch Tracked" : ""}${isSerialTracked ? " • Serial Tracked" : ""} • Default Unit Cost: RM ${formatNumberByDecimalPlaces(selectedProduct.unitCost, stockSettings.unitCostDecimalPlaces)}` : "Only active inventory-tracked products are shown."}</p>
                  </div>

                  <div>
                    <label className="label-rk">Qty</label>
                    <input
                          type="text"
                          inputMode={stockSettings.qtyDecimalPlaces === 0 ? "numeric" : "decimal"}
                          className={`input-rk ${getFieldErrorClass(line.qtyError)}`}
                          value={line.qty}
                          disabled={isSerialTracked}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            if (!isValidInputByDecimalPlaces(nextValue, stockSettings.qtyDecimalPlaces)) return;
                            updateLine(index, { qty: nextValue });
                          }}
                          onBlur={(e) => updateLine(index, { qty: finalizeInputByDecimalPlaces(e.target.value, stockSettings.qtyDecimalPlaces, 1) })}
                          required
                        />
                    {isSerialTracked ? <p className="mt-2 text-xs text-white/45">Qty auto-follows selected serial count and uses Base UOM.</p> : null}
                  </div>

                  <div>
                    <label className="label-rk">Unit Cost</label>
                    <input
                          type="text"
                          inputMode="decimal"
                          className="input-rk"
                          value={line.unitCost}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            if (!isValidInputByDecimalPlaces(nextValue, stockSettings.unitCostDecimalPlaces)) return;
                            updateLine(index, { unitCost: nextValue });
                          }}
                          onBlur={(e) => updateLine(index, { unitCost: finalizeInputByDecimalPlaces(e.target.value, stockSettings.unitCostDecimalPlaces, 0) })}
                        />
                  </div>

                  {requiresSingleLocation(transactionType) ? (
                    <div className="md:col-span-2 xl:col-span-2">
                      <SearchableSelect label="Location" placeholder="Search or select location" options={locationOptions} value={singleLocationMode && lockedLocationId ? lockedLocationId : line.locationId} disabled={singleLocationMode} onChange={(option) => updateLine(index, { locationId: option?.id || "", batchNo: "", batchMode: "existing", expiryDate: "", serialNos: [], serialSearch: "" })} />
                      <p className="mt-2 text-xs text-white/45">{getBalanceText(line.inventoryProductId, line.locationId, balanceBatchNo, selectedProduct, line.adjustmentDirection)}</p>
                    </div>
                  ) : null}

                  {transactionType === "SA" ? (
                    <div>
                      <label className="label-rk">Adjustment Direction</label>
                      <div className="relative">
                        <select className="input-rk appearance-none pr-12" value={line.adjustmentDirection} onChange={(e) => updateLine(index, { adjustmentDirection: e.target.value as "" | AdjustmentDirectionValue, serialNos: [] })} required>
                          <option value="">Select direction</option>
                          <option value="IN">IN</option>
                          <option value="OUT">OUT</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
                      </div>
                    </div>
                  ) : null}

                  {transactionType === "ST" ? (
                    <>
                      <div>
                        <SearchableSelect label="From Location" placeholder="Search or select source location" options={locationOptions} value={line.fromLocationId} onChange={(option) => updateLine(index, { fromLocationId: option?.id || "", batchNo: "", batchMode: "existing", expiryDate: "", serialNos: [], serialSearch: "" })} />
                        <p className="mt-2 text-xs text-white/45">{getBalanceText(line.inventoryProductId, line.fromLocationId, balanceBatchNo, selectedProduct, line.adjustmentDirection)}</p>
                      </div>
                      <div>
                        <SearchableSelect label="To Location" placeholder="Search or select destination location" options={locationOptions} value={line.toLocationId} onChange={(option) => updateLine(index, { toLocationId: option?.id || "" })} />
                        <p className="mt-2 text-xs text-white/45">{getBalanceText(line.inventoryProductId, line.toLocationId, balanceBatchNo, selectedProduct, line.adjustmentDirection)}</p>
                      </div>
                    </>
                  ) : null}

                  {isBatchTracked ? (
                    <>
                      <div className="md:col-span-2 xl:col-span-2">
                        <SearchableSelect
                          label="Batch No"
                          placeholder={loadingBatches[index] ? (outboundBatchFlow ? "Loading available batches..." : "Loading existing batches...") : outboundBatchFlow ? "Search or select batch no" : "Select existing batch or create new"}
                          options={outboundBatchFlow ? (availableBatches[index] || []).map((batch) => ({ id: batch.batchNo, label: batch.balance != null ? `${batch.batchNo}${batch.expiryDate ? ` • Exp ${formatDateInput(batch.expiryDate)}` : ""} • Bal ${formatQty(batch.balance, stockSettings.qtyDecimalPlaces)}` : `${batch.batchNo}${batch.expiryDate ? ` • Exp ${formatDateInput(batch.expiryDate)}` : ""}`, searchText: `${batch.batchNo} ${batch.expiryDate || ""}`.toLowerCase() })) : [{ id: "__NEW__", label: "+ Create New Batch", searchText: "create new batch new" }, ...(availableBatches[index] || []).map((batch) => ({ id: batch.batchNo, label: `${batch.batchNo}${batch.expiryDate ? ` • Exp ${formatDateInput(batch.expiryDate)}` : ""}`, searchText: `${batch.batchNo} ${batch.expiryDate || ""}`.toLowerCase() }))]}
                          value={inboundBatchFlow && line.batchMode === "new" ? "__NEW__" : line.batchNo}
                          disabled={loadingBatches[index]}
                          onChange={(option) => outboundBatchFlow ? setOutboundBatch(index, option?.id || "") : setInboundBatch(index, option?.id || "")}
                        />
                      </div>
                      {inboundBatchFlow && line.batchMode === "new" ? (
                        <div>
                          <label className="label-rk">New Batch No</label>
                          <input className="input-rk" value={line.batchNo} onChange={(e) => setInboundNewBatchValue(index, e.target.value)} placeholder="Enter new batch no" />
                        </div>
                      ) : null}
                      {inboundBatchFlow ? (
                        <div>
                          <label className="label-rk">Expiry Date</label>
                          <input type="date" className="input-rk" value={line.expiryDate} onChange={(e) => updateLine(index, { expiryDate: e.target.value })} />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {isSerialTracked && inboundSerialFlow ? (
                    <>
                      <div className="md:col-span-2 xl:col-span-2">
                        <SearchableSelect
                          label="Serial No"
                          placeholder="Select existing serial or create new"
                          options={[{ id: "__NEW__", label: "+ Create New Serial", searchText: "create new serial" }, ...line.serialNos.map((serialNo) => ({ id: serialNo, label: serialNo, searchText: serialNo.toLowerCase() }))]}
                          value={line.serialSearch === "__NEW__" ? "__NEW__" : ""}
                          onChange={(option) => {
                            if (!option) return;
                            if (option.id === "__NEW__") { updateLine(index, { serialSearch: "__NEW__", serialEntryText: "" }); return; }
                            addInboundSerial(index, option.id);
                            updateLine(index, { serialSearch: "" });
                          }}
                        />
                      </div>
                      {line.serialSearch === "__NEW__" ? (
                        <div className="space-y-2">
                          <label className="label-rk">New Serial No</label>
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <input
                              className="input-rk flex-1"
                              value={line.serialEntryText}
                              onChange={(e) => updateLine(index, { serialEntryText: e.target.value })}
                              placeholder="Enter new serial no"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!line.serialEntryText.trim()) return;
                                addInboundSerial(index, line.serialEntryText);
                                updateLine(index, { serialEntryText: "", serialSearch: "" });
                              }}
                              className="inline-flex min-w-[160px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                            >
                              Create New Serial
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="md:col-span-2 xl:col-span-4">
                        <div className="mt-1 flex flex-wrap gap-2">
                          {line.serialNos.length === 0 ? <div className="text-sm text-white/45">No serial numbers added yet.</div> : line.serialNos.map((serialNo) => <button key={serialNo} type="button" onClick={() => removeInboundSerial(index, serialNo)} className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10">{serialNo} ✕</button>)}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {isSerialTracked && outboundSerialFlow ? (
                    <div className="md:col-span-2 xl:col-span-4">
                      <OutboundSerialPicker
                        label="Serial No"
                        availableSerials={serialRows}
                        selectedSerials={line.serialNos}
                        searchValue={line.serialSearch}
                        onSearchValueChange={(value) => updateLine(index, { serialSearch: value })}
                        onToggle={(serialNo) => toggleSelectedSerial(index, serialNo)}
                        disabled={loadingSerials[index]}
                      />
                      <p className="mt-2 text-xs text-white/45">
                        {loadingSerials[index]
                          ? "Loading available serial numbers..."
                          : serialRows.length === 0
                            ? `No available serial numbers found for the selected product/location${isBatchTracked ? "/batch" : ""}.`
                            : "Select available serial numbers from the dropdown."}
                      </p>
                    </div>
                  ) : null}

                  <div className="md:col-span-2 xl:col-span-4">
                    <label className="label-rk">Product Remarks</label>
                    <input className="input-rk" value={line.remarks} onChange={(e) => updateLine(index, { remarks: e.target.value })} placeholder="Optional product remarks" />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={addLine} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Add Product</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => router.push(getBackHref(transactionType))} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Back</button>
          <button disabled={isSubmitting} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Saving..." : `Save ${title}`}</button>
        </div>

        {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
        {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
      </form>
    </div>
  );
}
