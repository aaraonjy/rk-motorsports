"use client";

import { useMemo, useState } from "react";

type StockLocationRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  code: string;
  name: string;
  isActive: boolean;
};

type Props = {
  initialItems: StockLocationRecord[];
};

function emptyForm(): FormState {
  return {
    code: "",
    name: "",
    isActive: true,
  };
}

export function AdminStockLocationClient({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return items.filter((item) => {
      const matchesKeyword =
        !normalizedKeyword ||
        item.code.toLowerCase().includes(normalizedKeyword) ||
        item.name.toLowerCase().includes(normalizedKeyword);

      const matchesStatus =
        statusFilter === "ALL" || (statusFilter === "ACTIVE" ? item.isActive : !item.isActive);

      return matchesKeyword && matchesStatus;
    });
  }, [items, keyword, statusFilter]);

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

  function startEdit(item: StockLocationRecord) {
    setEditingId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      isActive: item.isActive,
    });
    setSubmitError("");
    setSubmitSuccess("");
    setIsModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        isActive: form.isActive,
      };

      const response = await fetch(editingId ? `/api/admin/stock/locations/${editingId}` : "/api/admin/stock/locations", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to save stock location.");
        return;
      }

      const saved = data.item as StockLocationRecord;
      setItems((prev) => (editingId ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev]));
      setSubmitSuccess(editingId ? "Stock location updated successfully." : "Stock location created successfully.");
      closeModal();
    } catch {
      setSubmitError("Unable to save stock location right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(item: StockLocationRecord) {
    const confirmed = window.confirm(`Delete stock location ${item.code}? This cannot be undone.`);
    if (!confirmed) return;

    setSubmitError("");
    setSubmitSuccess("");

    try {
      const response = await fetch(`/api/admin/stock/locations/${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to delete stock location.");
        return;
      }
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setSubmitSuccess("Stock location deleted successfully.");
    } catch {
      setSubmitError("Unable to delete stock location right now.");
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Stock Location List</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Existing Locations</h2>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:min-w-[620px] xl:grid-cols-[minmax(260px,1.5fr)_minmax(170px,0.8fr)_auto]">
            <input className="input-rk w-full min-w-0" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search code / name" />
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <button type="button" onClick={openAddModal} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
              Add Location
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
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredItems.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-white/50">No stock locations found.</td></tr>
              ) : filteredItems.map((item) => (
                <tr key={item.id} className="align-top text-white/80">
                  <td className="px-3 py-4 font-semibold text-white">{item.code}</td>
                  <td className="px-3 py-4">
                    <div className="font-medium text-white">{item.name}</div>
                  </td>
                  <td className="px-3 py-4">
                    <span className={item.isActive ? "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300" : "inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/65"}>
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">Edit Location</button>
                      <button type="button" onClick={() => handleDelete(item)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15">Delete</button>
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Stock Location</p>
              <h2 className="mt-3 text-2xl font-bold text-white">{editingId ? "Edit Location" : "Add Location"}</h2>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label-rk">Location Code</label>
                  <input className="input-rk" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="e.g. MAIN" required />
                </div>
                <div>
                  <label className="label-rk">Location Name</label>
                  <input className="input-rk" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Main Warehouse" required />
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                  <span>Active</span>
                </label>
              </div>

              {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button disabled={isSubmitting} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSubmitting ? "Saving..." : editingId ? "Save Changes" : "Create Location"}
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
