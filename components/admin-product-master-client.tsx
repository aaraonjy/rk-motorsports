"use client";

import { useMemo, useState } from "react";

type InventoryItemTypeValue = "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";

type StockLocationOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type InventoryProductRecord = {
  id: string;
  code: string;
  description: string;
  group: string | null;
  subGroup: string | null;
  brand: string | null;
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
  group: string;
  subGroup: string;
  brand: string;
  itemType: InventoryItemTypeValue;
  baseUom: string;
  unitCost: string;
  sellingPrice: string;
  trackInventory: boolean;
  serialNumberTracking: boolean;
  isActive: boolean;
  defaultLocationId: string;
};

type Props = {
  initialProducts: InventoryProductRecord[];
  locations: StockLocationOption[];
};

function emptyForm(defaultLocationId = ""): ProductFormState {
  return {
    code: "",
    description: "",
    group: "",
    subGroup: "",
    brand: "",
    itemType: "STOCK_ITEM",
    baseUom: "PCS",
    unitCost: "0.00",
    sellingPrice: "0.00",
    trackInventory: true,
    serialNumberTracking: false,
    isActive: true,
    defaultLocationId,
  };
}

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

export function AdminProductMasterClient({ initialProducts, locations }: Props) {
  const defaultLocationId = locations.find((item) => item.isActive)?.id || "";
  const [products, setProducts] = useState(initialProducts);
  const [keyword, setKeyword] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState<"ALL" | InventoryItemTypeValue>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm(defaultLocationId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

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
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" ? product.isActive : !product.isActive);

      return matchesKeyword && matchesType && matchesStatus;
    });
  }, [products, keyword, itemTypeFilter, statusFilter]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm(defaultLocationId));
    setSubmitError("");
    setSubmitSuccess("");
  }

  function startEdit(product: InventoryProductRecord) {
    setEditingId(product.id);
    setForm({
      code: product.code,
      description: product.description,
      group: product.group || "",
      subGroup: product.subGroup || "",
      brand: product.brand || "",
      itemType: product.itemType,
      baseUom: product.baseUom,
      unitCost: product.unitCost.toFixed(2),
      sellingPrice: product.sellingPrice.toFixed(2),
      trackInventory: product.trackInventory,
      serialNumberTracking: product.serialNumberTracking,
      isActive: product.isActive,
      defaultLocationId: product.defaultLocationId || defaultLocationId,
    });
    setSubmitError("");
    setSubmitSuccess("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        group: form.group.trim(),
        subGroup: form.subGroup.trim(),
        brand: form.brand.trim(),
        baseUom: form.baseUom.trim().toUpperCase(),
        unitCost: Number(normalizeMoneyInput(form.unitCost)),
        sellingPrice: Number(normalizeMoneyInput(form.sellingPrice)),
        defaultLocationId: form.defaultLocationId || null,
      };

      const response = await fetch(
        editingId ? `/api/admin/products/${editingId}` : "/api/admin/products",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to save product.");
        return;
      }

      const saved = data.product as InventoryProductRecord;
      setProducts((prev) => {
        if (editingId) {
          return prev.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...prev];
      });
      setEditingId(null);
      setForm(emptyForm(defaultLocationId));
      setSubmitError("");
      setSubmitSuccess(editingId ? "Product updated successfully." : "Product created successfully.");
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
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to delete product.");
        return;
      }
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
      if (editingId === product.id) {
        resetForm();
      }
      setSubmitSuccess("Product deleted successfully.");
    } catch {
      setSubmitError("Unable to delete product right now.");
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1.05fr_1.55fr]">
      <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Product Master</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{editingId ? "Edit Product" : "Create Product"}</h2>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10">
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label-rk">Product Code</label>
              <input className="input-rk" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g. BP-BREMBO-M4" required />
            </div>
            <div>
              <label className="label-rk">Base UOM</label>
              <input className="input-rk" value={form.baseUom} onChange={(e) => setForm((prev) => ({ ...prev, baseUom: e.target.value.toUpperCase() }))} placeholder="PCS" required />
            </div>
          </div>

          <div>
            <label className="label-rk">Description</label>
            <input className="input-rk" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="e.g. Brake Pad (Brembo M4)" required />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label-rk">Group</label>
              <input className="input-rk" value={form.group} onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="label-rk">Sub-Group</label>
              <input className="input-rk" value={form.subGroup} onChange={(e) => setForm((prev) => ({ ...prev, subGroup: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="label-rk">Brand</label>
              <input className="input-rk" value={form.brand} onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))} placeholder="Optional" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label-rk">Item Type</label>
              <div className="relative">
                <select className="input-rk appearance-none pr-12" value={form.itemType} onChange={(e) => {
                  const itemType = e.target.value as InventoryItemTypeValue;
                  setForm((prev) => ({
                    ...prev,
                    itemType,
                    trackInventory: itemType === "STOCK_ITEM",
                  }));
                }}>
                  <option value="STOCK_ITEM">Stock Item</option>
                  <option value="SERVICE_ITEM">Service Item</option>
                  <option value="NON_STOCK_ITEM">Non-Stock Item</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>
            <div>
              <label className="label-rk">Default Location</label>
              <div className="relative">
                <select className="input-rk appearance-none pr-12" value={form.defaultLocationId} onChange={(e) => setForm((prev) => ({ ...prev, defaultLocationId: e.target.value }))}>
                  <option value="">No default location</option>
                  {locations.filter((item) => item.isActive).map((location) => (
                    <option key={location.id} value={location.id}>{location.code} — {location.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label-rk">Unit Cost (RM)</label>
              <input type="number" min="0" step="0.01" className="input-rk" value={form.unitCost} onChange={(e) => setForm((prev) => ({ ...prev, unitCost: e.target.value }))} />
            </div>
            <div>
              <label className="label-rk">Selling Price (RM)</label>
              <input type="number" min="0" step="0.01" className="input-rk" value={form.sellingPrice} onChange={(e) => setForm((prev) => ({ ...prev, sellingPrice: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75 md:grid-cols-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.trackInventory} disabled={form.itemType !== "STOCK_ITEM"} onChange={(e) => setForm((prev) => ({ ...prev, trackInventory: e.target.checked }))} />
              <span>Track Inventory</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.serialNumberTracking} onChange={(e) => setForm((prev) => ({ ...prev, serialNumberTracking: e.target.checked }))} />
              <span>Serial Number Tracking</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
              <span>Active</span>
            </label>
          </div>

          {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
          {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}

          <button disabled={isSubmitting} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? "Saving..." : editingId ? "Update Product" : "Create Product"}
          </button>
        </div>
      </form>

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Product List</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Existing Products</h2>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[640px] xl:grid-cols-[minmax(260px,1.4fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)]">
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
          </div>
        </div>

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
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-white/50">No products found.</td>
                </tr>
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
                      <button type="button" onClick={() => startEdit(product)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">Edit</button>
                      <button type="button" onClick={() => handleDelete(product)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
