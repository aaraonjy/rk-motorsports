
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type InventoryItemTypeValue = "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
type MasterOption = { id: string; code: string; name: string; isActive: boolean };
type SubGroupOption = MasterOption & { groupId: string };
type StockLocationOption = { id: string; code: string; name: string; isActive: boolean };

type InventoryProductRecord = {
  id: string;
  code: string;
  description: string;
  group: string | null;
  subGroup: string | null;
  brand: string | null;
  groupId: string | null;
  subGroupId: string | null;
  brandId: string | null;
  itemType: InventoryItemTypeValue;
  baseUom: string;
  unitCost: number;
  sellingPrice: number;
  trackInventory: boolean;
  serialNumberTracking: boolean;
  isActive: boolean;
  defaultLocationId: string | null;
  defaultLocationLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProductFormState = {
  code: string;
  description: string;
  groupId: string;
  subGroupId: string;
  brandId: string;
  groupSearch: string;
  subGroupSearch: string;
  brandSearch: string;
  itemType: InventoryItemTypeValue;
  baseUom: string;
  unitCost: string;
  sellingPrice: string;
  trackInventory: boolean;
  serialNumberTracking: boolean;
  isActive: boolean;
};

type Props = {
  initialProducts: InventoryProductRecord[];
  locations: StockLocationOption[];
  productGroups: MasterOption[];
  productSubGroups: SubGroupOption[];
  productBrands: MasterOption[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeMoneyInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "0.00";
  return parsed.toFixed(2);
}

function emptyForm(defaultLocationId = ""): ProductFormState {
  return {
    code: "",
    description: "",
    groupId: "",
    subGroupId: "",
    brandId: "",
    groupSearch: "",
    subGroupSearch: "",
    brandSearch: "",
    itemType: "STOCK_ITEM",
    baseUom: "PCS",
    unitCost: "0.00",
    sellingPrice: "0.00",
    trackInventory: true,
    serialNumberTracking: false,
    isActive: true,
  };
}

function getItemTypeLabel(value: InventoryItemTypeValue) {
  switch (value) {
    case "STOCK_ITEM":
      return "Stock Item";
    case "SERVICE_ITEM":
      return "Service Item";
    case "NON_STOCK_ITEM":
      return "Non-Stock Item";
    default:
      return value;
  }
}


type SearchableSelectOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
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
  const [search, setSearch] = useState(value);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

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
    const activeOptions = options.filter((item) => item.isActive);
    if (!keyword) return activeOptions;
    return activeOptions.filter(
      (item) =>
        item.code.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword) ||
        `${item.code} — ${item.name}`.toLowerCase().includes(keyword)
    );
  }, [options, search]);

  const selectedOption = useMemo(() => {
    return (
      options.find(
        (item) =>
          `${item.code} — ${item.name}` === value ||
          item.name === value ||
          item.code === value
      ) || null
    );
  }, [options, value]);

  return (
    <div ref={containerRef} className="relative">
      <label className="label-rk">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
          setSearch(selectedOption ? `${selectedOption.code} — ${selectedOption.name}` : "");
        }}
        className={`input-rk flex items-center justify-between gap-3 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>
          {selectedOption ? `${selectedOption.code} — ${selectedOption.name}` : placeholder}
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
              <div className="rounded-xl px-3 py-3 text-sm text-white/45">
                No matching {label.toLowerCase()} found.
              </div>
            ) : (
              filteredOptions.map((option) => {
                const displayLabel = `${option.code} — ${option.name}`;
                const isSelected = selectedOption?.id === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option);
                      setSearch(displayLabel);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                      isSelected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {displayLabel}
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

export function AdminProductMasterClient({
  initialProducts,
  locations,
  productGroups,
  productSubGroups,
  productBrands,
}: Props) {
    const [products, setProducts] = useState(initialProducts);
  const [keyword, setKeyword] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState<"ALL" | InventoryItemTypeValue>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const activeGroups = useMemo(() => productGroups.filter((item) => item.isActive), [productGroups]);
  const activeBrands = useMemo(() => productBrands.filter((item) => item.isActive), [productBrands]);
  const filteredSubGroups = useMemo(
    () => productSubGroups.filter((item) => item.isActive && (!form.groupId || item.groupId === form.groupId)),
    [productSubGroups, form.groupId]
  );

  const filteredProducts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return products.filter((product) => {
      const matchesKeyword =
        !normalizedKeyword ||
        product.code.toLowerCase().includes(normalizedKeyword) ||
        product.description.toLowerCase().includes(normalizedKeyword) ||
        (product.brand || "").toLowerCase().includes(normalizedKeyword) ||
        (product.group || "").toLowerCase().includes(normalizedKeyword) ||
        (product.subGroup || "").toLowerCase().includes(normalizedKeyword);

      const matchesType = itemTypeFilter === "ALL" || product.itemType === itemTypeFilter;
      const matchesStatus = statusFilter === "ALL" || (statusFilter === "ACTIVE" ? product.isActive : !product.isActive);
      return matchesKeyword && matchesType && matchesStatus;
    });
  }, [products, keyword, itemTypeFilter, statusFilter]);

  function closeModal() {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setSubmitError("");
  }

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm());
    setSubmitError("");
    setSubmitSuccess("");
    setIsModalOpen(true);
  }

  function startEdit(product: InventoryProductRecord) {
    setEditingId(product.id);
    setForm({
      code: product.code,
      description: product.description,
      groupId: product.groupId || "",
      subGroupId: product.subGroupId || "",
      brandId: product.brandId || "",
      groupSearch: product.group || "",
      subGroupSearch: product.subGroup || "",
      brandSearch: product.brand || "",
      itemType: product.itemType,
      baseUom: product.baseUom,
      unitCost: product.unitCost.toFixed(2),
      sellingPrice: product.sellingPrice.toFixed(2),
      trackInventory: product.trackInventory,
      serialNumberTracking: product.serialNumberTracking,
      isActive: product.isActive,
    });
    setSubmitError("");
    setSubmitSuccess("");
    setIsModalOpen(true);
  }

  function resolveMasterSelection(
    search: string,
    options: Array<MasterOption | SubGroupOption>,
    label: string
  ) {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return { id: "", error: "" };
    const matched = options.find(
      (item) =>
        item.isActive &&
        (item.name.toLowerCase() === normalized ||
          item.code.toLowerCase() === normalized ||
          `${item.code} — ${item.name}`.toLowerCase() === normalized)
    );
    if (!matched) return { id: "", error: `${label} not found.` };
    return { id: matched.id, error: "" };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    const groupResolved = resolveMasterSelection(form.groupSearch, activeGroups, "Group");
    if (groupResolved.error) {
      setSubmitError(groupResolved.error);
      setIsSubmitting(false);
      return;
    }

    const subGroupPool = form.groupId || groupResolved.id
      ? productSubGroups.filter((item) => item.groupId === (form.groupId || groupResolved.id))
      : productSubGroups;

    const subGroupResolved = resolveMasterSelection(form.subGroupSearch, subGroupPool, "Sub-Group");
    if (subGroupResolved.error) {
      setSubmitError(subGroupResolved.error);
      setIsSubmitting(false);
      return;
    }

    const brandResolved = resolveMasterSelection(form.brandSearch, activeBrands, "Brand");
    if (brandResolved.error) {
      setSubmitError(brandResolved.error);
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        groupId: groupResolved.id || form.groupId || null,
        subGroupId: subGroupResolved.id || form.subGroupId || null,
        brandId: brandResolved.id || form.brandId || null,
        baseUom: form.baseUom.trim().toUpperCase(),
        itemType: form.itemType,
        unitCost: Number(normalizeMoneyInput(form.unitCost)),
        sellingPrice: Number(normalizeMoneyInput(form.sellingPrice)),
        trackInventory: form.itemType === "STOCK_ITEM" ? form.trackInventory : false,
        serialNumberTracking: form.serialNumberTracking,
        isActive: form.isActive,
        defaultLocationId: null,
      };

      const response = await fetch(editingId ? `/api/admin/products/${editingId}` : "/api/admin/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to save product.");
        return;
      }

      const saved = data.product as InventoryProductRecord;
      setProducts((prev) => (editingId ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev]));
      setSubmitSuccess(editingId ? "Product updated successfully." : "Product created successfully.");
      closeModal();
    } catch {
      setSubmitError("Unable to save product right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(product: InventoryProductRecord) {
    const confirmed = window.confirm(`Delete product ${product.code}? This cannot be undone.`);
    if (!confirmed) return;
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to delete product.");
        return;
      }
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
      setSubmitSuccess("Product deleted successfully.");
    } catch {
      setSubmitError("Unable to delete product right now.");
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Product List</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Existing Products</h2>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:min-w-[720px] xl:grid-cols-[minmax(260px,1.5fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_auto]">
            <input className="input-rk w-full min-w-0" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search code / description / brand" />
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={itemTypeFilter} onChange={(e) => setItemTypeFilter(e.target.value as any)}>
                <option value="ALL">All Types</option>
                <option value="STOCK_ITEM">Stock Item</option>
                <option value="SERVICE_ITEM">Service Item</option>
                <option value="NON_STOCK_ITEM">Non-Stock Item</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <button type="button" onClick={openAddModal} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
              Add Product
            </button>
          </div>
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
                <th className="px-3 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Description</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">UOM</th>
                <th className="px-3 py-3 font-medium">Selling Price</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredProducts.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-white/50">No products found.</td></tr>
              ) : filteredProducts.map((product) => (
                <tr key={product.id} className="align-top text-white/80">
                  <td className="px-3 py-4 font-semibold text-white">{product.code}</td>
                  <td className="px-3 py-4">
                    <div className="font-medium text-white">{product.description}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {[product.brand, product.group, product.subGroup].filter(Boolean).join(" • ") || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-4">{getItemTypeLabel(product.itemType)}</td>
                  <td className="px-3 py-4">{product.baseUom}</td>
                  <td className="px-3 py-4">{formatCurrency(product.sellingPrice)}</td>
                  <td className="px-3 py-4">
                    <span className={product.isActive ? "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300" : "inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/65"}>
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => startEdit(product)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">Edit Product</button>
                      <button type="button" onClick={() => handleDelete(product)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Product Master</p><h2 className="mt-3 text-2xl font-bold text-white">{editingId ? "Edit Product" : "Add Product"}</h2></div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-rk">Product Code</label><input className="input-rk" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g. BP-BREMBO-M4" required /></div>
                <div><label className="label-rk">Base UOM</label><input className="input-rk" value={form.baseUom} onChange={(e) => setForm((prev) => ({ ...prev, baseUom: e.target.value.toUpperCase() }))} placeholder="PCS" required /></div>
              </div>

              <div><label className="label-rk">Description</label><input className="input-rk" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="e.g. Brake Pad (Brembo M4)" required /></div>

              
<div className="grid gap-4 md:grid-cols-3">
                <SearchableSelect
                  label="Group"
                  placeholder="Search or select group"
                  options={activeGroups}
                  value={form.groupSearch}
                  onChange={(option) =>
                    setForm((prev) => ({
                      ...prev,
                      groupSearch: option ? `${option.code} — ${option.name}` : "",
                      groupId: option?.id || "",
                      subGroupId: "",
                      subGroupSearch: "",
                    }))
                  }
                />
                <SearchableSelect
                  label="Sub-Group"
                  placeholder={form.groupId ? "Search or select sub-group" : "Select group first"}
                  options={filteredSubGroups}
                  value={form.subGroupSearch}
                  disabled={!form.groupId}
                  onChange={(option) =>
                    setForm((prev) => ({
                      ...prev,
                      subGroupSearch: option ? `${option.code} — ${option.name}` : "",
                      subGroupId: option?.id || "",
                    }))
                  }
                />
                <SearchableSelect
                  label="Brand"
                  placeholder="Search or select brand"
                  options={activeBrands}
                  value={form.brandSearch}
                  onChange={(option) =>
                    setForm((prev) => ({
                      ...prev,
                      brandSearch: option ? `${option.code} — ${option.name}` : "",
                      brandId: option?.id || "",
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label-rk">Item Type</label>
                  <div className="relative">
                    <select className="input-rk appearance-none pr-12" value={form.itemType} onChange={(e) => {
                      const itemType = e.target.value as InventoryItemTypeValue;
                      setForm((prev) => ({ ...prev, itemType, trackInventory: itemType === "STOCK_ITEM" }));
                    }}>
                      <option value="STOCK_ITEM">Stock Item</option>
                      <option value="SERVICE_ITEM">Service Item</option>
                      <option value="NON_STOCK_ITEM">Non-Stock Item</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-rk">Unit Cost (RM)</label><input type="number" min="0" step="0.01" className="input-rk" value={form.unitCost} onChange={(e) => setForm((prev) => ({ ...prev, unitCost: e.target.value }))} /></div>
                <div><label className="label-rk">Selling Price (RM)</label><input type="number" min="0" step="0.01" className="input-rk" value={form.sellingPrice} onChange={(e) => setForm((prev) => ({ ...prev, sellingPrice: e.target.value }))} /></div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75 md:grid-cols-3">
                <label className="flex items-center gap-3"><input type="checkbox" checked={form.trackInventory} disabled={form.itemType !== "STOCK_ITEM"} onChange={(e) => setForm((prev) => ({ ...prev, trackInventory: e.target.checked }))} /><span>Track Inventory</span></label>
                <label className="flex items-center gap-3"><input type="checkbox" checked={form.serialNumberTracking} onChange={(e) => setForm((prev) => ({ ...prev, serialNumberTracking: e.target.checked }))} /><span>Serial Number Tracking</span></label>
                <label className="flex items-center gap-3"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} /><span>Active</span></label>
              </div>

              {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button disabled={isSubmitting} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSubmitting ? "Saving..." : editingId ? "Save Changes" : "Create Product"}
                </button>
                <button type="button" onClick={closeModal} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
