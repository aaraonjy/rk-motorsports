
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StockTransactionTypeValue = "OB" | "SR" | "SI" | "SA" | "ST";
type AdjustmentDirectionValue = "IN" | "OUT";

type InventoryProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
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
  transactionType: StockTransactionTypeValue;
  transactionDate: string;
  reference?: string | null;
  remarks?: string | null;
  lines: TransactionLineRecord[];
};

type Props = {
  transactionType: StockTransactionTypeValue;
  title: string;
  intro: string;
  initialProducts: InventoryProductOption[];
  initialLocations: StockLocationOption[];
};

type FormLine = {
  inventoryProductId: string;
  qty: string;
  unitCost: string;
  remarks: string;
  locationId: string;
  fromLocationId: string;
  toLocationId: string;
  adjustmentDirection: "" | AdjustmentDirectionValue;
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
  error?: string;
};

function emptyLine(): FormLine {
  return {
    inventoryProductId: "",
    qty: "1",
    unitCost: "0.00",
    remarks: "",
    locationId: "",
    fromLocationId: "",
    toLocationId: "",
    adjustmentDirection: "",
  };
}

function requiresSingleLocation(type: StockTransactionTypeValue) {
  return type === "OB" || type === "SR" || type === "SI" || type === "SA";
}

function formatDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatQty(value: string | number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

function formatLocationLabel(location?: { code: string; name: string } | null) {
  return location ? `${location.code} — ${location.name}` : "-";
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
    default:
      return type;
  }
}

function balanceKey(productId: string, locationId: string) {
  return `${productId}__${locationId}`;
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

export function AdminStockTransactionClient({
  transactionType,
  title,
  intro,
  initialProducts,
  initialLocations,
}: Props) {
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState<Record<string, boolean>>({});
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const activeLocations = useMemo(() => initialLocations.filter((item) => item.isActive), [initialLocations]);

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
      activeLocations.map((location) => ({
        id: location.id,
        label: `${location.code} — ${location.name}`,
        searchText: `${location.code} ${location.name}`.toLowerCase(),
      })),
    [activeLocations]
  );

  const filteredTransactions = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return transactions.filter((item) => {
      const matchesKeyword =
        !keyword ||
        item.transactionNo.toLowerCase().includes(keyword) ||
        (item.reference || "").toLowerCase().includes(keyword) ||
        (item.remarks || "").toLowerCase().includes(keyword) ||
        item.lines.some(
          (line) =>
            line.inventoryProduct.code.toLowerCase().includes(keyword) ||
            line.inventoryProduct.description.toLowerCase().includes(keyword) ||
            (line.location?.code || "").toLowerCase().includes(keyword) ||
            (line.fromLocation?.code || "").toLowerCase().includes(keyword) ||
            (line.toLocation?.code || "").toLowerCase().includes(keyword)
        );

      const rowDate = formatDateInput(item.transactionDate);
      const matchesFrom = !dateFrom || rowDate >= dateFrom;
      const matchesTo = !dateTo || rowDate <= dateTo;

      return matchesKeyword && matchesFrom && matchesTo;
    });
  }, [transactions, searchKeyword, dateFrom, dateTo]);

  async function loadTransactions() {
    setIsLoadingTransactions(true);
    try {
      const response = await fetch(`/api/admin/stock/transactions?transactionType=${transactionType}`, {
        cache: "no-store",
      });
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
  }, [transactionType]);

  useEffect(() => {
    const needed = new Set<string>();

    for (const line of lines) {
      if (line.inventoryProductId && line.locationId) needed.add(balanceKey(line.inventoryProductId, line.locationId));
      if (line.inventoryProductId && line.fromLocationId) needed.add(balanceKey(line.inventoryProductId, line.fromLocationId));
      if (line.inventoryProductId && line.toLocationId) needed.add(balanceKey(line.inventoryProductId, line.toLocationId));
    }

    const targets = Array.from(needed);
    if (targets.length === 0 || !isCreateOpen) return;

    let cancelled = false;

    setLoadingBalances((prev) => {
      const next = { ...prev };
      for (const key of targets) next[key] = true;
      return next;
    });

    async function fetchBalance(key: string) {
      const [inventoryProductId, locationId] = key.split("__");
      try {
        const params = new URLSearchParams({ inventoryProductId, locationId });
        const response = await fetch(`/api/admin/stock/balance?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as BalanceResponse;

        if (cancelled) return;

        let resolvedBalance = 0;
        if (response.ok && data.ok) {
          if (typeof data.balance === "number") {
            resolvedBalance = Number(data.balance);
          } else if (Array.isArray(data.balances) && data.balances.length > 0) {
            resolvedBalance = Number(data.balances[0]?.balance ?? 0);
          }
        }
        setBalances((prev) => ({ ...prev, [key]: resolvedBalance }));
      } catch {
        if (!cancelled) {
          setBalances((prev) => ({ ...prev, [key]: 0 }));
        }
      } finally {
        if (!cancelled) {
          setLoadingBalances((prev) => ({ ...prev, [key]: false }));
        }
      }
    }

    targets.forEach((key) => {
      void fetchBalance(key);
    });

    return () => {
      cancelled = true;
    };
  }, [lines, isCreateOpen]);

  function resetForm() {
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setRemarks("");
    setLines([emptyLine()]);
    setSubmitError("");
    setSubmitSuccess("");
    setBalances({});
    setLoadingBalances({});
  }

  function openCreateModal() {
    resetForm();
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
    setSubmitError("");
  }

  function updateLine(index: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function getBalanceText(productId: string, locationId: string) {
    if (!productId || !locationId) return "Select product and location to view balance.";
    const key = balanceKey(productId, locationId);
    if (loadingBalances[key]) return "Loading current balance...";
    return `Current Balance: ${formatQty(typeof balances[key] === "number" ? balances[key] : 0)}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const payload = {
        transactionType,
        transactionDate,
        reference: reference.trim() || null,
        remarks: remarks.trim() || null,
        lines: lines.map((line) => ({
          inventoryProductId: line.inventoryProductId || null,
          qty: Number(line.qty || 0),
          unitCost: line.unitCost.trim() ? Number(line.unitCost) : null,
          remarks: line.remarks.trim() || null,
          locationId: line.locationId || null,
          fromLocationId: line.fromLocationId || null,
          toLocationId: line.toLocationId || null,
          adjustmentDirection: line.adjustmentDirection || null,
        })),
      };

      const response = await fetch("/api/admin/stock/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || `Unable to create ${title.toLowerCase()}.`);
        return;
      }

      setSubmitSuccess(`${title} created successfully.`);
      await loadTransactions();
      closeCreateModal();
    } catch {
      setSubmitError(`Unable to create ${title.toLowerCase()} right now.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">{getTypeLabel(transactionType)}</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Existing {title} Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/65">{intro}</p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400"
          >
            Create {title}
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label-rk">Search</label>
              <input
                className="input-rk"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Search doc no / reference / product / location"
              />
            </div>
            <div>
              <label className="label-rk">Date From</label>
              <input type="date" className="input-rk" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label-rk">Date To</label>
              <input type="date" className="input-rk" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-white/45">
                <th className="px-3 py-3 font-medium">Doc No</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Reference</th>
                <th className="px-3 py-3 font-medium">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoadingTransactions ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-white/50">Loading transactions...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-white/50">No transactions found.</td></tr>
              ) : (
                filteredTransactions.map((item) => (
                  <tr key={item.id} className="align-top text-white/80">
                    <td className="px-3 py-4 font-semibold text-white">{item.transactionNo}</td>
                    <td className="px-3 py-4">{formatDateInput(item.transactionDate)}</td>
                    <td className="px-3 py-4">{item.reference || "-"}</td>
                    <td className="px-3 py-4">
                      <div className="space-y-2">
                        {item.lines.map((line) => (
                          <div key={line.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-white/75">
                            <div className="font-semibold text-white">{line.inventoryProduct.code} — {line.inventoryProduct.description}</div>
                            <div className="mt-1">Qty: {formatQty(line.qty)} {line.inventoryProduct.baseUom}</div>
                            {transactionType === "ST" ? (
                              <div className="mt-1">From: {formatLocationLabel(line.fromLocation)} → To: {formatLocationLabel(line.toLocation)}</div>
                            ) : (
                              <div className="mt-1">Location: {formatLocationLabel(line.location)}</div>
                            )}
                            {transactionType === "SA" ? <div className="mt-1">Direction: {line.adjustmentDirection || "-"}</div> : null}
                            <div className="mt-1">Unit Cost: {formatQty(line.unitCost)}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">{getTypeLabel(transactionType)}</p>
                <h3 className="mt-3 text-2xl font-bold text-white">Create {title}</h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{intro}</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="label-rk">Transaction Date</label>
                  <input type="date" className="input-rk" value={formatDateInput(transactionDate)} onChange={(e) => setTransactionDate(e.target.value)} required />
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
                  return (
                    <div key={index} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Line {index + 1}</div>
                        {lines.length > 1 ? (
                          <button type="button" onClick={() => removeLine(index)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15">
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="xl:col-span-2">
                          <SearchableSelect
                            label="Product"
                            placeholder="Search or select product"
                            options={productOptions}
                            value={line.inventoryProductId}
                            onChange={(option) =>
                              updateLine(index, {
                                inventoryProductId: option?.id || "",
                              })
                            }
                          />
                          <p className="mt-2 text-xs text-white/45">{selectedProduct ? `UOM: ${selectedProduct.baseUom}` : "Only active inventory-tracked products are shown."}</p>
                        </div>

                        <div>
                          <label className="label-rk">Qty</label>
                          <input type="number" min="0.01" step="0.01" className="input-rk" value={line.qty} onChange={(e) => updateLine(index, { qty: e.target.value })} required />
                        </div>

                        <div>
                          <label className="label-rk">Unit Cost</label>
                          <input type="number" min="0" step="0.01" className="input-rk" value={line.unitCost} onChange={(e) => updateLine(index, { unitCost: e.target.value })} />
                        </div>

                        {requiresSingleLocation(transactionType) ? (
                          <div className="md:col-span-2 xl:col-span-2">
                            <SearchableSelect
                              label="Location"
                              placeholder="Search or select location"
                              options={locationOptions}
                              value={line.locationId}
                              onChange={(option) => updateLine(index, { locationId: option?.id || "" })}
                            />
                            <p className="mt-2 text-xs text-white/45">{getBalanceText(line.inventoryProductId, line.locationId)}</p>
                          </div>
                        ) : null}

                        {transactionType === "SA" ? (
                          <div>
                            <label className="label-rk">Adjustment Direction</label>
                            <div className="relative">
                              <select className="input-rk appearance-none pr-12" value={line.adjustmentDirection} onChange={(e) => updateLine(index, { adjustmentDirection: e.target.value as "" | AdjustmentDirectionValue })} required>
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
                              <SearchableSelect
                                label="From Location"
                                placeholder="Search or select source location"
                                options={locationOptions}
                                value={line.fromLocationId}
                                onChange={(option) => updateLine(index, { fromLocationId: option?.id || "" })}
                              />
                              <p className="mt-2 text-xs text-white/45">{getBalanceText(line.inventoryProductId, line.fromLocationId)}</p>
                            </div>
                            <div>
                              <SearchableSelect
                                label="To Location"
                                placeholder="Search or select destination location"
                                options={locationOptions}
                                value={line.toLocationId}
                                onChange={(option) => updateLine(index, { toLocationId: option?.id || "" })}
                              />
                              <p className="mt-2 text-xs text-white/45">{getBalanceText(line.inventoryProductId, line.toLocationId)}</p>
                            </div>
                          </>
                        ) : null}

                        <div className="md:col-span-2 xl:col-span-4">
                          <label className="label-rk">Line Remarks</label>
                          <input className="input-rk" value={line.remarks} onChange={(e) => updateLine(index, { remarks: e.target.value })} placeholder="Optional line remarks" />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button type="button" onClick={addLine} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          Add Line
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={addLine} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">
                  Add Line
                </button>
                <button disabled={isSubmitting} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSubmitting ? "Saving..." : `Create ${title}`}
                </button>
              </div>

              {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
              {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
