"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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

type SearchableSelectOption = {
  id: string;
  label: string;
  searchText: string;
};

type TemplateApiLine = {
  id: string;
  lineNo: number;
  componentProductId: string;
  qty: number;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string | null;
};

type AssemblyTemplateResponse = {
  ok: boolean;
  template: {
    id: string;
    finishedGoodProductId: string;
    remarks: string | null;
    lines: TemplateApiLine[];
  } | null;
  error?: string;
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

type TemplateLineForm = {
  templateLineId: string;
  lineNo: number;
  componentProductId: string;
  qty: string;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string;
  batchNo: string;
  batchMode: "existing" | "new";
  serialNos: string[];
  serialEntryText: string;
};

type TransactionSummary = {
  id: string;
  transactionNo: string;
  transactionDate: string;
  status: "POSTED" | "CANCELLED";
  reference?: string | null;
  revisedFrom?: { id: string; transactionNo: string } | null;
  revisions?: Array<{ id: string }>;
  lines: Array<{
    id: string;
    qty: number | string;
    batchNo?: string | null;
    adjustmentDirection?: "IN" | "OUT" | null;
    inventoryProduct: {
      id: string;
      code: string;
      description: string;
      baseUom: string;
    };
    location?: { id: string; code: string; name: string } | null;
  }>;
};

type CancelTarget = {
  id: string;
  transactionNo: string;
};

type StockSettingsConfig = {
  stockModuleEnabled: boolean;
  multiLocationEnabled: boolean;
  allowNegativeStock: boolean;
  costingMethod: "AVERAGE";
  defaultLocationId: string;
};

type StockSettingsResponse = {
  ok: boolean;
  config?: StockSettingsConfig;
  error?: string;
};

function formatDateInput(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatQty(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

function normalizeQtyInput(value: string) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return "1";
  return String(parsed);
}

function normalizeBatchNo(value: string) {
  return value.trim().toUpperCase();
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

function clampSerialNosToQty(values: string[], qty: string | number | null | undefined) {
  const unique = uniqueSerialNos(values);
  const parsedQty = Math.max(0, Math.floor(Number(qty ?? 0)));
  if (parsedQty <= 0) return [];
  return unique.slice(0, parsedQty);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBatchLabel(batch: AvailableBatch) {
  const parts = [batch.batchNo];
  if (batch.expiryDate) parts.push(`Exp ${formatDateInput(batch.expiryDate)}`);
  if (typeof batch.balance === "number") parts.push(`Bal ${formatQty(batch.balance)}`);
  return parts.join(" • ");
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
          setSearch(selectedOption?.label || "");
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

function BatchPicker({
  label,
  batches,
  value,
  onChange,
  allowCreate = false,
  disabled = false,
}: {
  label: string;
  batches: AvailableBatch[];
  value: string;
  onChange: (payload: { mode: "existing" | "new"; batchNo: string }) => void;
  allowCreate?: boolean;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedBatch = useMemo(
    () => batches.find((item) => item.batchNo.toUpperCase() === value.trim().toUpperCase()) || null,
    [batches, value]
  );

  useEffect(() => {
    setSearch(selectedBatch ? formatBatchLabel(selectedBatch) : value);
  }, [selectedBatch, value]);

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
    const keyword = search.trim().toLowerCase();
    if (!keyword) return batches;
    return batches.filter((item) => formatBatchLabel(item).toLowerCase().includes(keyword));
  }, [batches, search]);

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
        <span className={value ? "truncate text-white" : "truncate text-white/45"}>
          {value ? (selectedBatch ? formatBatchLabel(selectedBatch) : value) : "Select existing batch or create new"}
        </span>
        <span className="shrink-0 text-white/60">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
          <div className="border-b border-white/10 p-3">
            <input
              autoFocus
              className="input-rk"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search batch no"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {allowCreate ? (
              <button
                type="button"
                onClick={() => {
                  onChange({ mode: "new", batchNo: "" });
                  setIsOpen(false);
                }}
                className="flex w-full items-center rounded-xl px-3 py-3 text-left text-sm text-white transition hover:bg-white/10"
              >
                + Create New Batch
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-sm text-white/45">No batch found.</div>
            ) : (
              filtered.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => {
                    onChange({ mode: "existing", batchNo: batch.batchNo });
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                    value.trim().toUpperCase() === batch.batchNo.toUpperCase()
                      ? "bg-white/10 text-white"
                      : "text-white/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {formatBatchLabel(batch)}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}



function SerialPicker({
  label,
  availableSerials,
  selectedSerials,
  entryText,
  onEntryTextChange,
  onToggle,
  disabled = false,
}: {
  label: string;
  availableSerials: AvailableSerial[];
  selectedSerials: string[];
  entryText: string;
  onEntryTextChange: (value: string) => void;
  onToggle: (serialNo: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualMode, setManualMode] = useState(false);
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
    const keyword = search.trim().toLowerCase();
    if (!keyword) return availableSerials;
    return availableSerials.filter((item) => {
      const label = `${item.serialNo} ${item.batchNo || ""} ${item.expiryDate ? formatDateInput(item.expiryDate) : ""}`.toLowerCase();
      return label.includes(keyword);
    });
  }, [availableSerials, search]);

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
            setSearch("");
          }}
          className={`input-rk flex items-center justify-between gap-3 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className={selectedSerials.length > 0 || entryText.trim() ? "truncate text-white" : "truncate text-white/45"}>
            {selectedSerials.length > 0
              ? `${selectedSerials.length} serial(s) selected`
              : entryText.trim()
              ? "1 manual serial entered"
              : "Select existing serial or create new"}
          </span>
          <span className="shrink-0 text-white/60">▾</span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
            <div className="border-b border-white/10 p-3">
              <input
                autoFocus
                className="input-rk"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search serial no"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => {
                  setManualMode(true);
                  setIsOpen(false);
                }}
                className="flex w-full items-center rounded-xl px-3 py-3 text-left text-sm text-white transition hover:bg-white/10"
              >
                + Create New Serial
              </button>

              {filtered.length === 0 ? (
                <div className="rounded-xl px-3 py-3 text-sm text-white/45">No serial found.</div>
              ) : (
                filtered.map((serial) => {
                  const selected = selectedSerials.some((item) => item.toUpperCase() === serial.serialNo.toUpperCase());
                  const meta = [serial.batchNo || null, serial.expiryDate ? `Exp ${formatDateInput(serial.expiryDate)}` : null]
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

      {manualMode ? (
        <div>
          <label className="label-rk">New Serial No</label>
          <input
            className="input-rk"
            value={entryText}
            onChange={(e) => onEntryTextChange(e.target.value)}
            placeholder="Enter new serial no"
          />
        </div>
      ) : null}

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



export function AdminStockAssemblyClient({
  finishedGoods,
  allProducts,
  locations,
}: {
  finishedGoods: InventoryProductOption[];
  allProducts: InventoryProductOption[];
  locations: StockLocationOption[];
}) {
  const [finishedGoodId, setFinishedGoodId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [assemblyQty, setAssemblyQty] = useState("1.00");
  const [transactionDate, setTransactionDate] = useState(formatDateInput());
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fgBatchNo, setFgBatchNo] = useState("");
  const [fgBatchMode, setFgBatchMode] = useState<"existing" | "new">("new");
  const [fgBatchExpiryDate, setFgBatchExpiryDate] = useState("");
  const [fgSerialEntryText, setFgSerialEntryText] = useState("");
  const [fgSerialNos, setFgSerialNos] = useState<string[]>([]);
  const [templateLines, setTemplateLines] = useState<TemplateLineForm[]>([]);
  const [templateError, setTemplateError] = useState("");
  const [templateInfo, setTemplateInfo] = useState("");
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<Record<number, AvailableBatch[]>>({});
  const [availableSerials, setAvailableSerials] = useState<Record<number, AvailableSerial[]>>({});
  const [fgAvailableBatches, setFgAvailableBatches] = useState<AvailableBatch[]>([]);
  const [fgAvailableSerials, setFgAvailableSerials] = useState<AvailableSerial[]>([]);
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [stockSettings, setStockSettings] = useState<StockSettingsConfig>({
    stockModuleEnabled: false,
    multiLocationEnabled: true,
    allowNegativeStock: false,
    costingMethod: "AVERAGE",
    defaultLocationId: "",
  });

  const activeLocations = useMemo(() => locations.filter((item) => item.isActive), [locations]);
  const finishedGoodMap = useMemo(() => new Map(finishedGoods.map((item) => [item.id, item])), [finishedGoods]);
  const productMap = useMemo(() => new Map(allProducts.map((item) => [item.id, item])), [allProducts]);

  const finishedGoodOptions = useMemo<SearchableSelectOption[]>(
    () =>
      finishedGoods.map((product) => ({
        id: product.id,
        label: `${product.code} — ${product.description}`,
        searchText: `${product.code} ${product.description} ${product.baseUom}`.toLowerCase(),
      })),
    [finishedGoods]
  );

  const locationOptions = useMemo<SearchableSelectOption[]>(
    () =>
      activeLocations.map((location) => ({
        id: location.id,
        label: `${location.code} — ${location.name}`,
        searchText: `${location.code} ${location.name}`.toLowerCase(),
      })),
    [activeLocations]
  );

  const selectedFinishedGood = finishedGoodId ? finishedGoodMap.get(finishedGoodId) || null : null;
  const parsedAssemblyQty = Math.max(0, Math.floor(Number(assemblyQty || "0")));

  const visibleTransactions = useMemo(
    () => transactions.filter((item) => !(Array.isArray(item.revisions) && item.revisions.length > 0)),
    [transactions]
  );

  async function loadTransactions() {
    setIsLoadingTransactions(true);
    try {
      const response = await fetch("/api/admin/stock/transactions?transactionType=AS", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setTransactions([]);
        return;
      }
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoadingTransactions(false);
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStockSettings() {
      try {
        const response = await fetch("/api/admin/settings/stock", { cache: "no-store" });
        const data = (await response.json()) as StockSettingsResponse;
        if (!response.ok || !data.ok || cancelled) return;
        setStockSettings(
          data.config || {
            stockModuleEnabled: false,
            multiLocationEnabled: true,
            allowNegativeStock: false,
            costingMethod: "AVERAGE",
            defaultLocationId: "",
          }
        );
      } catch {
        if (!cancelled) {
          setStockSettings({
            stockModuleEnabled: false,
            multiLocationEnabled: true,
            allowNegativeStock: false,
            costingMethod: "AVERAGE",
            defaultLocationId: "",
          });
        }
      }
    }

    void loadStockSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetCreateForm() {
    setFinishedGoodId("");
    setLocationId(stockSettings.defaultLocationId || "");
    setAssemblyQty("1");
    setTransactionDate(formatDateInput());
    setReference("");
    setRemarks("");
    setFgBatchNo("");
    setFgBatchMode("new");
    setFgBatchExpiryDate("");
    setFgSerialEntryText("");
    setFgSerialNos([]);
    setTemplateLines([]);
    setTemplateError("");
    setTemplateInfo("");
    setAvailableBatches({});
    setAvailableSerials({});
    setFgAvailableBatches([]);
    setFgAvailableSerials([]);
    setSubmitError("");
    setSubmitSuccess("");
  }

  useEffect(() => {
    if (!isCreateOpen) return;
    if (!stockSettings.defaultLocationId) return;
    setLocationId((prev) => prev || stockSettings.defaultLocationId);
  }, [isCreateOpen, stockSettings.defaultLocationId]);

  useEffect(() => {
    if (!finishedGoodId) {
      setTemplateLines([]);
      setTemplateError("");
      setTemplateInfo("");
      return;
    }

    let cancelled = false;
    setIsLoadingTemplate(true);
    setTemplateError("");
    setTemplateInfo("");

    fetch(`/api/admin/stock/assembly-templates/${finishedGoodId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as AssemblyTemplateResponse;
        if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load assembly template.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const rows = data.template?.lines || [];
        if (rows.length === 0) {
          setTemplateLines([]);
          setTemplateInfo("No assembly template lines found for this finished good.");
          return;
        }

        setTemplateLines(
          rows.map((line) => ({
            templateLineId: line.id,
            lineNo: line.lineNo,
            componentProductId: line.componentProductId,
            qty: formatQty(line.qty * parsedAssemblyQty),
            uom: line.uom,
            isRequired: line.isRequired,
            allowOverride: line.allowOverride,
            remarks: line.remarks || "",
            batchNo: "",
            batchMode: "existing",
            serialNos: [],
            serialEntryText: "",
          }))
        );
        setTemplateInfo("");
      })
      .catch((error) => {
        if (cancelled) return;
        setTemplateLines([]);
        setTemplateError(error instanceof Error ? error.message : "Unable to load assembly template.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTemplate(false);
      });

    return () => {
      cancelled = true;
    };
  }, [finishedGoodId, parsedAssemblyQty]);

  useEffect(() => {
    if (!locationId || !selectedFinishedGood) {
      setFgAvailableBatches([]);
      setFgAvailableSerials([]);
      return;
    }

    if (selectedFinishedGood.batchTracking) {
      const params = new URLSearchParams({
        inventoryProductId: selectedFinishedGood.id,
        locationId,
        direction: "inbound",
      });
      fetch(`/api/admin/stock/batches?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.ok) return [];
          return Array.isArray(data.items) ? data.items : [];
        })
        .then((rows: AvailableBatch[]) => {
          setFgAvailableBatches(rows);
          if (fgBatchMode === "existing" && fgBatchNo.trim()) {
            const matched = rows.find((item) => item.batchNo.toUpperCase() === fgBatchNo.trim().toUpperCase()) || null;
            setFgBatchExpiryDate(matched?.expiryDate ? formatDateInput(matched.expiryDate) : "");
          }
        })
        .catch(() => setFgAvailableBatches([]));
    } else {
      setFgAvailableBatches([]);
      setFgBatchExpiryDate("");
    }

    if (selectedFinishedGood.serialNumberTracking) {
      const params = new URLSearchParams({
        inventoryProductId: selectedFinishedGood.id,
        locationId,
      });
      fetch(`/api/admin/stock/serials?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.ok) return [];
          return Array.isArray(data.serials) ? data.serials : [];
        })
        .then((rows: AvailableSerial[]) => setFgAvailableSerials(rows))
        .catch(() => setFgAvailableSerials([]));
    } else {
      setFgAvailableSerials([]);
    }
  }, [locationId, selectedFinishedGood, fgBatchMode, fgBatchNo]);

  useEffect(() => {
    if (!locationId) {
      setAvailableBatches({});
      setAvailableSerials({});
      return;
    }

    templateLines.forEach((line, index) => {
      const product = productMap.get(line.componentProductId);

      if (!product?.batchTracking) {
        setAvailableBatches((prev) => ({ ...prev, [index]: [] }));
      } else {
        const params = new URLSearchParams({
          inventoryProductId: line.componentProductId,
          locationId,
          direction: "outbound",
        });
        fetch(`/api/admin/stock/batches?${params.toString()}`, { cache: "no-store" })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data.ok) return [];
            return Array.isArray(data.items) ? data.items : [];
          })
          .then((rows: AvailableBatch[]) => setAvailableBatches((prev) => ({ ...prev, [index]: rows })))
          .catch(() => setAvailableBatches((prev) => ({ ...prev, [index]: [] })));
      }

      if (!product?.serialNumberTracking) {
        setAvailableSerials((prev) => ({ ...prev, [index]: [] }));
      } else {
        const params = new URLSearchParams({
          inventoryProductId: line.componentProductId,
          locationId,
        });
        if (product.batchTracking && line.batchNo.trim()) {
          params.set("batchNo", line.batchNo.trim().toUpperCase());
        }
        fetch(`/api/admin/stock/serials?${params.toString()}`, { cache: "no-store" })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data.ok) return [];
            return Array.isArray(data.serials) ? data.serials : [];
          })
          .then((rows: AvailableSerial[]) => setAvailableSerials((prev) => ({ ...prev, [index]: rows })))
          .catch(() => setAvailableSerials((prev) => ({ ...prev, [index]: [] })));
      }
    });
  }, [templateLines, locationId, productMap]);

  function updateTemplateLine(index: number, updater: (current: TemplateLineForm) => TemplateLineForm) {
    setTemplateLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? updater(line) : line)));
  }

  function toggleFgSerial(serialNo: string) {
    const exists = fgSerialNos.some((item) => item.toUpperCase() === serialNo.toUpperCase());
    const next = exists ? fgSerialNos.filter((item) => item.toUpperCase() !== serialNo.toUpperCase()) : [...fgSerialNos, serialNo];
    const clamped = clampSerialNosToQty(next, assemblyQty);
    setFgSerialNos(clamped);
    setFgSerialEntryText(clamped.join("\n"));
  }

  function toggleLineSerial(index: number, serialNo: string) {
    updateTemplateLine(index, (current) => {
      const exists = current.serialNos.some((item) => item.toUpperCase() === serialNo.toUpperCase());
      const next = exists
        ? current.serialNos.filter((item) => item.toUpperCase() !== serialNo.toUpperCase())
        : [...current.serialNos, serialNo];
      const clamped = clampSerialNosToQty(next, current.qty);
      return { ...current, serialNos: clamped, serialEntryText: clamped.join("\n") };
    });
  }

  const fgUnitCost = useMemo(() => {
    const total = templateLines.reduce((sum, line) => {
      const product = productMap.get(line.componentProductId);
      return sum + (product?.unitCost || 0) * Number(line.qty || 0);
    }, 0);
    return parsedAssemblyQty > 0 ? total / parsedAssemblyQty : 0;
  }, [templateLines, productMap, parsedAssemblyQty]);

  async function handleSubmit() {
    setSubmitError("");
    setSubmitSuccess("");

    if (!selectedFinishedGood) {
      setSubmitError("Please select a finished good.");
      return;
    }
    if (!locationId) {
      setSubmitError("Please select a location.");
      return;
    }
    if (templateLines.length === 0) {
      setSubmitError("No assembly template lines are loaded.");
      return;
    }

    setIsSubmitting(true);

    try {
      const lines = [
        {
          inventoryProductId: selectedFinishedGood.id,
          qty: Number(normalizeQtyInput(assemblyQty)),
          unitCost: Number(fgUnitCost.toFixed(2)),
          batchNo: selectedFinishedGood.batchTracking ? normalizeBatchNo(fgBatchNo) : null,
          expiryDate: selectedFinishedGood.batchTracking && fgBatchExpiryDate.trim() ? fgBatchExpiryDate : null,
          serialNos: selectedFinishedGood.serialNumberTracking ? uniqueSerialNos(parseSerialEntryText(fgSerialEntryText)) : [],
          remarks: remarks.trim() || null,
          locationId,
          adjustmentDirection: "IN",
        },
        ...templateLines.map((line) => {
          const product = productMap.get(line.componentProductId);
          return {
            inventoryProductId: line.componentProductId,
            qty: Number(normalizeQtyInput(line.qty)),
            unitCost: Number((product?.unitCost || 0).toFixed(2)),
            batchNo: product?.batchTracking ? normalizeBatchNo(line.batchNo) : null,
            expiryDate: null,
            serialNos: product?.serialNumberTracking ? uniqueSerialNos(parseSerialEntryText(line.serialEntryText)) : [],
            remarks: line.remarks.trim() || null,
            locationId,
            adjustmentDirection: "OUT",
          };
        }),
      ];

      const response = await fetch("/api/admin/stock/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionType: "AS",
          transactionDate,
          reference: reference.trim() || null,
          remarks: remarks.trim() || null,
          lines,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to create stock assembly.");
        return;
      }

      setSubmitSuccess("Stock assembly created successfully.");
      setIsCreateOpen(false);
      resetCreateForm();
      await loadTransactions();
    } catch {
      setSubmitError("Unable to create stock assembly right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return;
    setIsCancelling(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/admin/stock/transactions/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to cancel stock assembly.");
        return;
      }
      setCancelTarget(null);
      setCancelReason("");
      await loadTransactions();
    } catch {
      setSubmitError("Unable to cancel stock assembly right now.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Assembly Transactions</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Posted Stock Assembly Documents</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/65">
              Create finished goods by consuming component stock based on predefined assembly templates. This will deduct component quantities and add the assembled product into inventory with full traceability.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetCreateForm();
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400"
          >
            Create Stock Assembly
          </button>
        </div>

        {(submitError || submitSuccess) ? (
          <div className="mt-5 space-y-3">
            {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
            {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-white/45">
                <th className="px-3 py-3 font-medium">Doc No</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Reference</th>
                                                                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoadingTransactions ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-white/50">Loading transactions...</td></tr>
              ) : visibleTransactions.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-white/50">No stock assembly transactions found.</td></tr>
              ) : (
                visibleTransactions.map((transaction) => {
                  const fgLine = transaction.lines.find((line) => line.adjustmentDirection === "IN") || transaction.lines[0];
                  return (
                    <tr key={transaction.id} className={`align-top text-white/80 ${transaction.status === "CANCELLED" ? "bg-red-500/5" : ""}`}>
                      <td className="px-3 py-4 font-semibold text-white">
                        <div>{transaction.transactionNo}</div>
                        {transaction.revisedFrom ? (
                          <Link href={`/admin/stock/transactions/${transaction.revisedFrom.id}`} className="mt-1 inline-flex text-xs text-white/45 transition hover:text-white/80">↳ Revision of {transaction.revisedFrom.transactionNo}</Link>
                        ) : null}
                      </td>
                      <td className="px-3 py-4">{formatDateInput(transaction.transactionDate)}</td>
                      <td className="px-3 py-4">{transaction.reference || "-"}</td>
                                                                                        <td className="px-3 py-4">
                        <span className={transaction.status === "CANCELLED" ? "inline-flex rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200" : "inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"}>
                          {transaction.status === "CANCELLED" ? "Cancelled" : "Posted"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-2">
                          <Link href={`/admin/stock/transactions/${transaction.id}`} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                            View
                          </Link>
                          <Link href={`/admin/stock/transactions/${transaction.id}/edit`} className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${transaction.status === "CANCELLED" ? "cursor-not-allowed border border-white/10 bg-white/5 opacity-50 pointer-events-none" : "border border-white/15 bg-white/5 hover:bg-white/10"}`}>
                            Edit
                          </Link>
                          <button
                            type="button"
                            disabled={transaction.status === "CANCELLED"}
                            onClick={() => setCancelTarget({ id: transaction.id, transactionNo: transaction.transactionNo })}
                            className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Create Assembly</p>
                <h2 className="mt-3 text-2xl font-bold text-white">New Stock Assembly</h2>
                <p className="mt-3 max-w-3xl text-white/70">
                  Create finished goods by consuming component stock based on predefined assembly templates. This will deduct component quantities and add the assembled product into inventory with full traceability.
                </p>
              </div>
            </div>

            {(templateError || templateInfo || submitError) ? (
              <div className="mt-5 space-y-3">
                {templateError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{templateError}</div> : null}
                {templateInfo ? <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{templateInfo}</div> : null}
                {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <SearchableSelect
                label="Finished Good"
                placeholder="Select assembly item"
                options={finishedGoodOptions}
                value={finishedGoodId}
                onChange={(option) => setFinishedGoodId(option?.id || "")}
              />
              <SearchableSelect
                label="Location"
                placeholder="Select location"
                options={locationOptions}
                value={locationId}
                onChange={(option) => setLocationId(option?.id || "")}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="label-rk">Assembly Date</label>
                <input type="date" className="input-rk" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
              </div>
              <div>
                <label className="label-rk">Assembly Qty</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="input-rk"
                  value={assemblyQty}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setAssemblyQty("");
                      setFgSerialNos([]);
                      setFgSerialEntryText("");
                      return;
                    }
                    const next = Math.floor(Number(raw));
                    const normalizedQty = Number.isFinite(next) && next > 0 ? String(next) : "1";
                    const clampedSerials = clampSerialNosToQty(fgSerialNos, normalizedQty);
                    setAssemblyQty(normalizedQty);
                    setFgSerialNos(clampedSerials);
                    setFgSerialEntryText(clampedSerials.join("\n"));
                  }}
                />
              </div>
              <div>
                <label className="label-rk">Reference</label>
                <input className="input-rk" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional reference" />
              </div>
            </div>

            <div className="mt-4">
              <label className="label-rk">Remarks</label>
              <textarea className="input-rk min-h-[110px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional remarks for this assembly document" />
            </div>

            {selectedFinishedGood ? (
              <div className="mt-6 rounded-[2rem] border border-sky-500/20 bg-sky-500/5 p-5">
                <p className="text-sm font-semibold text-white">Finished Good Stock In</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
                    <div className="font-semibold text-white">{selectedFinishedGood.code}</div>
                    <div className="mt-1 text-white/60">{selectedFinishedGood.description}</div>
                    <div className="mt-1 text-white/60">Qty In: {formatQty(assemblyQty)} {selectedFinishedGood.baseUom}</div>
                    <div className="mt-1 text-white/60">Estimated Unit Cost: {formatCurrency(fgUnitCost)}</div>
                  </div>
                  <div className="grid gap-4">
                    {selectedFinishedGood.batchTracking ? (
                      <div>
                        <BatchPicker
                          label="Finished Good Batch No"
                          batches={fgAvailableBatches}
                          value={fgBatchNo}
                          allowCreate
                          onChange={({ mode, batchNo }) => {
                            setFgBatchMode(mode);
                            setFgBatchNo(batchNo);
                            if (mode === "new") {
                              setFgBatchExpiryDate("");
                            } else {
                              const matched = fgAvailableBatches.find((item) => item.batchNo.toUpperCase() === batchNo.trim().toUpperCase()) || null;
                              setFgBatchExpiryDate(matched?.expiryDate ? formatDateInput(matched.expiryDate) : "");
                            }
                          }}
                        />
                        {fgBatchMode === "new" ? (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <input
                              className="input-rk"
                              value={fgBatchNo}
                              onChange={(e) => setFgBatchNo(e.target.value.toUpperCase())}
                              placeholder="Enter new batch no"
                            />
                            <input
                              type="date"
                              className="input-rk"
                              value={fgBatchExpiryDate}
                              onChange={(e) => setFgBatchExpiryDate(e.target.value)}
                            />
                          </div>
                        ) : fgBatchNo ? (
                          <div className="mt-3">
                            <label className="label-rk">Finished Good Batch Expiry Date</label>
                            <input type="date" className="input-rk" value={fgBatchExpiryDate} disabled />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedFinishedGood.serialNumberTracking ? (
                      <SerialPicker
                        label="Finished Good Serial No"
                        availableSerials={fgAvailableSerials}
                        selectedSerials={fgSerialNos}
                        entryText={fgSerialEntryText}
                        onEntryTextChange={(value) => {
                          const clamped = clampSerialNosToQty(parseSerialEntryText(value).map((item) => item.toUpperCase()), assemblyQty);
                          setFgSerialEntryText(clamped.join("\n"));
                          setFgSerialNos(clamped);
                        }}
                        onToggle={toggleFgSerial}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Component Stock Out</p>
                  <p className="mt-1 text-xs text-white/45">
                    Loaded from Assembly Template. Batch and serial selection below applies to the component stock out lines.
                  </p>
                </div>
                {isLoadingTemplate ? <div className="text-sm text-white/55">Loading template...</div> : null}
              </div>

              <div className="mt-5 space-y-4">
                {templateLines.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/45">
                    Select a finished good to load its assembly template.
                  </div>
                ) : (
                  templateLines.map((line, index) => {
                    const product = productMap.get(line.componentProductId);
                    const batches = availableBatches[index] || [];
                    const serials = availableSerials[index] || [];
                    return (
                      <div key={`${line.templateLineId}-${line.lineNo}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              Product {index + 1} — {product?.code || line.componentProductId}
                            </div>
                            <div className="mt-1 text-sm text-white/65">{product?.description || "-"}</div>
                            <div className="mt-1 text-xs text-white/45">
                              Base UOM: {product?.baseUom || line.uom} • Required: {line.isRequired ? "Yes" : "No"} • Override: {line.allowOverride ? "Allowed" : "No"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="label-rk">Qty Out</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              className="input-rk"
                              value={line.qty}
                              disabled={!line.allowOverride}
                              onChange={(e) =>
                                updateTemplateLine(index, (current) => {
                                  const nextQty = e.target.value;
                                  const clampedSerials = clampSerialNosToQty(current.serialNos, nextQty);
                                  return {
                                    ...current,
                                    qty: nextQty,
                                    serialNos: clampedSerials,
                                    serialEntryText: clampedSerials.join("\n"),
                                  };
                                })
                              }
                            />
                          </div>
                          <div>
                            <label className="label-rk">UOM</label>
                            <input className="input-rk" value={line.uom} disabled />
                          </div>
                        </div>

                        {product?.batchTracking ? (
                          <div className="mt-4">
                            <BatchPicker
                              label="Batch No"
                              batches={batches}
                              value={line.batchNo}
                              allowCreate={false}
                              onChange={({ mode, batchNo }) =>
                                updateTemplateLine(index, (current) => ({ ...current, batchMode: mode, batchNo }))
                              }
                            />
                          </div>
                        ) : null}

                        {product?.serialNumberTracking ? (
                          <div className="mt-4">
                            <SerialPicker
                              label="Serial No"
                              availableSerials={serials}
                              selectedSerials={line.serialNos}
                              entryText={line.serialEntryText}
                              onEntryTextChange={(value) =>
                                updateTemplateLine(index, (current) => {
                                  const clampedSerials = clampSerialNosToQty(parseSerialEntryText(value), current.qty);
                                  return {
                                    ...current,
                                    serialEntryText: clampedSerials.join("\n"),
                                    serialNos: clampedSerials,
                                  };
                                })
                              }
                              onToggle={(serialNo) => toggleLineSerial(index, serialNo)}
                            />
                          </div>
                        ) : null}

                        <div className="mt-4">
                          <label className="label-rk">Product Remarks</label>
                          <input
                            className="input-rk"
                            value={line.remarks}
                            onChange={(e) => updateTemplateLine(index, (current) => ({ ...current, remarks: e.target.value }))}
                            placeholder="Optional product remarks"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isSubmitting || !selectedFinishedGood || templateLines.length === 0}
                  onClick={() => void handleSubmit()}
                  className="inline-flex min-w-[200px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Creating..." : "Create Stock Assembly"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    resetCreateForm();
                  }}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Cancel Stock Assembly</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{cancelTarget.transactionNo}</h3>
            </div>
            <div className="mt-5">
              <label className="label-rk">Reason</label>
              <textarea
                className="input-rk min-h-[120px]"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Optional cancellation reason"
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleCancelConfirm()}
                disabled={isCancelling}
                className="rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason("");
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
