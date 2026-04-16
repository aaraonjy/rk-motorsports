
"use client";

import { useEffect, useMemo, useState } from "react";

type Item = { id: string; code: string; name: string; isActive: boolean; groupId?: string; groupLabel?: string | null };
type GroupOption = { id: string; code: string; name: string; isActive: boolean };

type Props = {
  title: string;
  subtitle: string;
  apiBase: string;
  initialItems: Item[];
  requireGroup?: boolean;
  groups?: GroupOption[];
};


function sortItemsByCode(items: Item[]) {
  return [...items].sort((a, b) => a.code.localeCompare(b.code));
}

export function AdminMasterListClient({ title, subtitle, apiBase, initialItems, requireGroup = false, groups = [] }: Props) {
  const [items, setItems] = useState(sortItemsByCode(initialItems));
  const [keyword, setKeyword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((item) =>
      !q ||
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.groupLabel || "").toLowerCase().includes(q)
    );
  }, [items, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(
    () => filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredItems, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function openCreate() {
    setEditingId(null);
    setCode("");
    setName("");
    setGroupId("");
    setIsActive(true);
    setError("");
    setSuccess("");
    setIsOpen(true);
  }

  function openEdit(item: Item) {
    setEditingId(item.id);
    setCode(item.code);
    setName(item.name);
    setGroupId(item.groupId || "");
    setIsActive(item.isActive);
    setError("");
    setSuccess("");
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
    setEditingId(null);
    setCode("");
    setName("");
    setGroupId("");
    setIsActive(true);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(editingId ? `${apiBase}/${editingId}` : apiBase, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, groupId: requireGroup ? (groupId || null) : null, isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to save record.");
        return;
      }
      const saved = data.item as Item;
      setItems((prev) => sortItemsByCode(editingId ? prev.map((item) => item.id === saved.id ? saved : item) : [...prev, saved]));
      setSuccess(editingId ? "Updated successfully." : "Created successfully.");
      closeModal();
    } catch {
      setError("Unable to save record right now.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: Item) {
    if (!window.confirm(`Delete ${item.code}?`)) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${apiBase}/${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to delete record.");
        return;
      }
      setItems((prev) => sortItemsByCode(prev.filter((row) => row.id !== item.id)));
      setSuccess("Deleted successfully.");
    } catch {
      setError("Unable to delete record right now.");
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">{subtitle}</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{title}</h2>
          </div>
          <div className="flex w-full flex-wrap gap-3 xl:w-auto">
            <input className="input-rk min-w-[260px]" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search code / name" />
            <button type="button" onClick={openCreate} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">Add New</button>
          </div>
        </div>

        {(error || success) ? (
          <div className="mt-5 space-y-3">
            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-white/45">
                <th className="px-3 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Name</th>
                {requireGroup ? <th className="px-3 py-3 font-medium">Group</th> : null}
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredItems.length === 0 ? (
                <tr><td colSpan={requireGroup ? 5 : 4} className="px-3 py-8 text-center text-white/50">No records found.</td></tr>
              ) : paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-4 font-semibold text-white">{item.code}</td>
                  <td className="px-3 py-4 text-white/80">{item.name}</td>
                  {requireGroup ? <td className="px-3 py-4 text-white/70">{item.groupLabel || "-"}</td> : null}
                  <td className="px-3 py-4">
                    <span className={item.isActive ? "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300" : "inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/65"}>{item.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td className="px-3 py-4"><div className="flex justify-end gap-2">
                    <button type="button" onClick={() => openEdit(item)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">Edit</button>
                    <button type="button" onClick={() => handleDelete(item)} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15">Delete</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredItems.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="text-sm text-white/55">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length} records
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80">
                Page {currentPage} / {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">{subtitle}</p>
                <h2 className="mt-3 text-2xl font-bold text-white">{editingId ? "Edit" : "Add"} {title}</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="label-rk">Code</label><input className="input-rk" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /></div>
                <div><label className="label-rk">Name</label><input className="input-rk" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              </div>
              {requireGroup ? (
                <div>
                  <label className="label-rk">Product Group</label>
                  <div className="relative">
                    <select className="input-rk appearance-none pr-12" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                      <option value="">Select group</option>
                      {groups.filter((item) => item.isActive).map((group) => (
                        <option key={group.id} value={group.id}>{group.code} — {group.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
                  </div>
                </div>
              ) : null}
              <label className="flex items-center gap-3 text-sm text-white/75">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>Active</span>
              </label>
              {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button disabled={isSaving} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Saving..." : "Save"}</button>
                <button type="button" onClick={closeModal} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
