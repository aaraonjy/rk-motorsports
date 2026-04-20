"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProductSummary = {
  id: string;
  code: string;
  description: string;
  itemType: string;
  trackInventory: boolean;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
};

type ComponentUomOption = {
  id?: string;
  uomCode: string;
  conversionRate: number;
};

type ComponentOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  batchTracking?: boolean;
  serialNumberTracking?: boolean;
  uomConversions?: ComponentUomOption[];
};

type TemplateProductRecord = {
  id: string;
  lineNo: number;
  componentProductId: string;
  componentProductCode: string;
  componentProductDescription: string;
  qty: number;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string | null;
};

type Props = {
  product: ProductSummary;
  componentOptions: ComponentOption[];
  initialRemarks: string;
  initialProducts: TemplateProductRecord[];
};

type EditableProduct = {
  id?: string;
  lineNo: number;
  componentProductId: string;
  qty: string;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string;
};

type SearchableSelectOption = {
  id: string;
  label: string;
  searchText: string;
};

type ComponentSearchableOption = SearchableSelectOption & {
  componentId: string;
  componentCode: string;
  componentDescription: string;
};

function emptyProduct(lineNo: number): EditableProduct {
  return {
    lineNo,
    componentProductId: "",
    qty: "1",
    uom: "",
    isRequired: true,
    allowOverride: false,
    remarks: "",
  };
}

function normalizeQty(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "1";
  return parsed.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function getUomOptions(component: ComponentOption | null | undefined) {
  if (!component) return [];
  const seen = new Set<string>();
  const options: SearchableSelectOption[] = [];
  const pushOption = (uomCode: string, conversionRate: number) => {
    const normalized = String(uomCode || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push({
      id: normalized,
      label: normalized === component.baseUom ? `${normalized} (Base UOM)` : `${normalized} (1 = ${conversionRate} ${component.baseUom})`,
      searchText: `${normalized} ${component.baseUom}`.toLowerCase(),
    });
  };
  pushOption(component.baseUom, 1);
  for (const item of component.uomConversions || []) {
    if (Number(item.conversionRate) > 0) pushOption(item.uomCode, Number(item.conversionRate));
  }
  return options;
}

function getComponentProductOptions(componentOptions: ComponentOption[]) {
  return componentOptions.map((option) => ({
    id: option.id,
    componentId: option.id,
    componentCode: option.code,
    componentDescription: option.description,
    label: `${option.code} — ${option.description}`,
    searchText: `${option.code} ${option.description} ${option.baseUom}`.toLowerCase(),
  }));
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

export function AdminAssemblyTemplateClient({
  product,
  componentOptions,
  initialRemarks,
  initialProducts,
}: Props) {
  const [remarks, setRemarks] = useState(initialRemarks);
  const [lines, setProducts] = useState<EditableProduct[]>(
    initialProducts.length > 0
      ? initialProducts.map((line, index) => ({
          id: line.id,
          lineNo: index + 1,
          componentProductId: line.componentProductId,
          qty: String(line.qty),
          uom: line.uom,
          isRequired: line.isRequired,
          allowOverride: line.allowOverride,
          remarks: line.remarks || "",
        }))
      : [emptyProduct(1)]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const optionMap = useMemo(() => new Map(componentOptions.map((item) => [item.id, item])), [componentOptions]);
  const componentProductOptions = useMemo<ComponentSearchableOption[]>(
    () => getComponentProductOptions(componentOptions),
    [componentOptions]
  );

  function renumber(nextProducts: EditableProduct[]) {
    return nextProducts.map((line, index) => ({ ...line, lineNo: index + 1 }));
  }

  function addProduct() {
    setProducts((prev) => [...prev, emptyProduct(prev.length + 1)]);
  }

  function removeProduct(lineNo: number) {
    setProducts((prev) => {
      const next = prev.filter((line) => line.lineNo !== lineNo);
      return renumber(next.length > 0 ? next : [emptyProduct(1)]);
    });
  }

  function updateProduct(lineNo: number, updater: (current: EditableProduct) => EditableProduct) {
    setProducts((prev) => prev.map((line) => (line.lineNo === lineNo ? updater(line) : line)));
  }

  async function handleSave() {
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const payload = {
        remarks: remarks.trim() || null,
        lines: lines.map((line, index) => ({
          id: line.id,
          lineNo: index + 1,
          componentProductId: line.componentProductId,
          qty: Number(normalizeQty(line.qty)),
          uom: line.uom.trim().toUpperCase(),
          isRequired: line.isRequired,
          allowOverride: line.allowOverride,
          remarks: line.remarks.trim() || null,
        })),
      };

      const response = await fetch(`/api/admin/stock/assembly-templates/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to save assembly template.");
        return;
      }

      const savedProducts = Array.isArray(data.template?.lines) ? data.template.lines : [];
      setRemarks(data.template?.remarks || "");
      setProducts(
        savedProducts.length > 0
          ? savedProducts.map((line: any, index: number) => ({
              id: line.id,
              lineNo: index + 1,
              componentProductId: line.componentProductId,
              qty: String(Number(line.qty ?? 0)),
              uom: line.uom,
              isRequired: Boolean(line.isRequired),
              allowOverride: Boolean(line.allowOverride),
              remarks: line.remarks || "",
            }))
          : [emptyProduct(1)]
      );
      setSubmitSuccess("Assembly template saved successfully.");
    } catch {
      setSubmitError("Unable to save assembly template right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!product.isAssemblyItem) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
        This product is not marked as an Assembly Item. Please go back to Product Master and enable Assembly Item first.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {(submitError || submitSuccess) ? (
        <div className="space-y-3">
          {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
          {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-5 text-sm text-sky-100">
        <p className="font-semibold">Assembly Template Products</p>
        <p className="mt-2 text-sky-100/80">
          Define the default BOM / component recipe for this finished good. Batch and serial allocation will still happen during actual Stock Assembly posting.
        </p>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
        <label className="label-rk">Template Remarks</label>
        <textarea
          className="input-rk min-h-[110px]"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Optional remarks for this assembly template"
        />
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Template Products</p>
            <p className="mt-1 text-xs text-white/45">
              Add component item, qty, UOM, required flag, and allow override setting.
            </p>
          </div>
          <button
            type="button"
            onClick={addProduct}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Add Product
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {lines.map((line) => {
            const selectedComponent = optionMap.get(line.componentProductId) || null;

            return (
              <div key={`${line.id || "new"}-${line.lineNo}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Product {line.lineNo}</div>
                  <button
                    type="button"
                    onClick={() => removeProduct(line.lineNo)}
                    className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <SearchableSelect
                      label="Product"
                      placeholder="Search or select product"
                      options={componentProductOptions}
                      value={line.componentProductId}
                      onChange={(option) => {
                        const nextProductId = option?.id || "";
                        const nextProduct = optionMap.get(nextProductId);
                        updateProduct(line.lineNo, (current) => ({
                          ...current,
                          componentProductId: nextProductId,
                          uom: current.uom || nextProduct?.baseUom || "",
                        }));
                      }}
                    />
                    {selectedComponent ? (
                      <p className="mt-2 text-xs text-white/45">
                        Base UOM: {selectedComponent.baseUom}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <SearchableSelect
                      label="UOM"
                      placeholder="Select UOM"
                      options={getUomOptions(selectedComponent)}
                      value={line.uom}
                      disabled={!selectedComponent}
                      onChange={(option) =>
                        updateProduct(line.lineNo, (current) => ({
                          ...current,
                          uom: option?.id || "",
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label-rk">Qty</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      className="input-rk"
                      value={line.qty}
                      onChange={(e) => updateProduct(line.lineNo, (current) => ({ ...current, qty: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label-rk">Remarks</label>
                    <input
                      className="input-rk"
                      value={line.remarks}
                      onChange={(e) => updateProduct(line.lineNo, (current) => ({ ...current, remarks: e.target.value }))}
                      placeholder="Optional product remarks"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75 md:grid-cols-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={line.isRequired}
                      onChange={(e) => updateProduct(line.lineNo, (current) => ({ ...current, isRequired: e.target.checked }))}
                    />
                    <span>Required</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={line.allowOverride}
                      onChange={(e) => updateProduct(line.lineNo, (current) => ({ ...current, allowOverride: e.target.checked }))}
                    />
                    <span>Allow Override</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
