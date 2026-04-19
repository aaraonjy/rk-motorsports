"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type InventoryProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  unitCost: number;
  batchTracking: boolean;
  serialNumberTracking: boolean;
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
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "1.00";
  return parsed.toFixed(2);
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
  const [fgSerialEntryText, setFgSerialEntryText] = useState("");
  const [fgSerialNos, setFgSerialNos] = useState<string[]>([]);
  const [templateLines, setTemplateLines] = useState<TemplateLineForm[]>([]);
  const [templateError, setTemplateError] = useState("");
  const [templateInfo, setTemplateInfo] = useState("");
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<Record<number, AvailableBatch[]>>({});
  const [availableSerials, setAvailableSerials] = useState<Record<number, AvailableSerial[]>>({});
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

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
  const parsedAssemblyQty = Math.max(0, Number(assemblyQty || "0"));

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
          .then((rows: AvailableBatch[]) => {
            setAvailableBatches((prev) => ({ ...prev, [index]: rows }));
          })
          .catch(() => {
            setAvailableBatches((prev) => ({ ...prev, [index]: [] }));
          });
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
          .then((rows: AvailableSerial[]) => {
            setAvailableSerials((prev) => ({ ...prev, [index]: rows }));
          })
          .catch(() => {
            setAvailableSerials((prev) => ({ ...prev, [index]: [] }));
          });
      }
    });
  }, [templateLines, locationId, productMap]);

  function updateTemplateLine(index: number, updater: (current: TemplateLineForm) => TemplateLineForm) {
    setTemplateLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? updater(line) : line)));
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
          expiryDate: null,
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

      setSubmitSuccess("Stock Assembly created successfully.");
      setReference("");
      setRemarks("");
      setFgBatchNo("");
      setFgSerialEntryText("");
      setFgSerialNos([]);
      setFinishedGoodId("");
      setTemplateLines([]);
      setTemplateError("");
      setTemplateInfo("");
      setAssemblyQty("1.00");
      await loadTransactions();
    } catch {
      setSubmitError("Unable to create stock assembly right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const visibleTransactions = useMemo(
    () => transactions.filter((item) => !(Array.isArray(item.revisions) && item.revisions.length > 0)),
    [transactions]
  );

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Create Assembly</p>
          <h2 className="mt-3 text-2xl font-bold text-white">New Stock Assembly</h2>
          <p className="mt-3 max-w-3xl text-white/70">
            Finished good will be posted as stock in, while component lines from the template will be posted as stock out using transaction type AS.
          </p>
        </div>

        {(submitError || submitSuccess || templateError || templateInfo) ? (
          <div className="mt-5 space-y-3">
            {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
            {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
            {templateError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{templateError}</div> : null}
            {templateInfo ? <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{templateInfo}</div> : null}
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
            <input type="number" min="0.01" step="0.01" className="input-rk" value={assemblyQty} onChange={(e) => setAssemblyQty(e.target.value)} />
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
                <div className="mt-1 text-white/60">
                  Qty In: {formatQty(assemblyQty)} {selectedFinishedGood.baseUom}
                </div>
                <div className="mt-1 text-white/60">Estimated Unit Cost: {formatCurrency(fgUnitCost)}</div>
              </div>
              <div className="grid gap-4">
                {selectedFinishedGood.batchTracking ? (
                  <div>
                    <label className="label-rk">Finished Good Batch No</label>
                    <input className="input-rk" value={fgBatchNo} onChange={(e) => setFgBatchNo(e.target.value.toUpperCase())} placeholder="Enter finished good batch no" />
                  </div>
                ) : null}
                {selectedFinishedGood.serialNumberTracking ? (
                  <div>
                    <label className="label-rk">Finished Good Serial No</label>
                    <textarea
                      className="input-rk min-h-[110px]"
                      value={fgSerialEntryText}
                      onChange={(e) => {
                        setFgSerialEntryText(e.target.value);
                        setFgSerialNos(uniqueSerialNos(parseSerialEntryText(e.target.value)));
                      }}
                      placeholder="Enter one serial per line or comma separated"
                    />
                    <p className="mt-2 text-xs text-white/45">
                      Serial count detected: {fgSerialNos.length}
                    </p>
                  </div>
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
                          Line {line.lineNo} — {product?.code || line.componentProductId}
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
                          onChange={(e) => updateTemplateLine(index, (current) => ({ ...current, qty: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="label-rk">UOM</label>
                        <input className="input-rk" value={line.uom} disabled />
                      </div>
                    </div>

                    {product?.batchTracking ? (
                      <div className="mt-4">
                        <label className="label-rk">Batch No</label>
                        <input
                          list={`assembly-batches-${index}`}
                          className="input-rk"
                          value={line.batchNo}
                          onChange={(e) => updateTemplateLine(index, (current) => ({ ...current, batchNo: e.target.value.toUpperCase() }))}
                          placeholder="Select or enter batch no"
                        />
                        <datalist id={`assembly-batches-${index}`}>
                          {batches.map((batch) => (
                            <option key={batch.id} value={batch.batchNo}>
                              {batch.balance != null ? `${batch.batchNo} (${formatQty(batch.balance)})` : batch.batchNo}
                            </option>
                          ))}
                        </datalist>
                      </div>
                    ) : null}

                    {product?.serialNumberTracking ? (
                      <div className="mt-4">
                        <label className="label-rk">Serial No</label>
                        <textarea
                          className="input-rk min-h-[110px]"
                          value={line.serialEntryText}
                          onChange={(e) =>
                            updateTemplateLine(index, (current) => ({
                              ...current,
                              serialEntryText: e.target.value,
                              serialNos: uniqueSerialNos(parseSerialEntryText(e.target.value)),
                            }))
                          }
                          placeholder="Enter one serial per line or comma separated"
                        />
                        <p className="mt-2 text-xs text-white/45">
                          Serial count detected: {line.serialNos.length}
                        </p>
                        {serials.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {serials.slice(0, 12).map((serial) => (
                              <button
                                key={serial.id}
                                type="button"
                                onClick={() =>
                                  updateTemplateLine(index, (current) => {
                                    const nextSerials = uniqueSerialNos([...current.serialNos, serial.serialNo]);
                                    return {
                                      ...current,
                                      serialNos: nextSerials,
                                      serialEntryText: nextSerials.join("\n"),
                                    };
                                  })
                                }
                                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75 transition hover:bg-white/10"
                              >
                                {serial.serialNo}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <label className="label-rk">Line Remarks</label>
                      <input className="input-rk" value={line.remarks} onChange={(e) => updateTemplateLine(index, (current) => ({ ...current, remarks: e.target.value }))} placeholder="Optional line remarks" />
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
              {isSubmitting ? "Posting..." : "Post Stock Assembly"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Assembly Transactions</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Posted Stock Assembly Documents</h2>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-white/45">
                <th className="px-3 py-3 font-medium">Doc No</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Finished Good</th>
                <th className="px-3 py-3 font-medium">Qty</th>
                <th className="px-3 py-3 font-medium">Location</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoadingTransactions ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-white/50">Loading...</td></tr>
              ) : visibleTransactions.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-white/50">No stock assembly transactions found.</td></tr>
              ) : (
                visibleTransactions.map((transaction) => {
                  const fgLine = transaction.lines.find((line) => line.adjustmentDirection === "IN") || transaction.lines[0];
                  return (
                    <tr key={transaction.id} className="align-top text-white/80">
                      <td className="px-3 py-4 font-semibold text-white">
                        <div>{transaction.transactionNo}</div>
                        {transaction.revisedFrom ? <div className="mt-1 text-xs text-white/45">↳ Revision of {transaction.revisedFrom.transactionNo}</div> : null}
                      </td>
                      <td className="px-3 py-4">{formatDateInput(transaction.transactionDate)}</td>
                      <td className="px-3 py-4">
                        <div className="font-medium text-white">{fgLine?.inventoryProduct.code || "-"}</div>
                        <div className="mt-1 text-xs text-white/45">{fgLine?.inventoryProduct.description || "-"}</div>
                      </td>
                      <td className="px-3 py-4">{formatQty(fgLine?.qty)} {fgLine?.inventoryProduct.baseUom || ""}</td>
                      <td className="px-3 py-4">{fgLine?.location ? `${fgLine.location.code} — ${fgLine.location.name}` : "-"}</td>
                      <td className="px-3 py-4">
                        <span className={transaction.status === "CANCELLED" ? "inline-flex rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200" : "inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"}>
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end">
                          <Link href={`/admin/stock/transactions/${transaction.id}`} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                            View Details
                          </Link>
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
    </>
  );
}
