"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_STOCK_NUMBER_FORMAT_CONFIG,
  formatNumberByDecimalPlaces,
  normalizeStockNumberFormatConfig,
} from "@/lib/stock-format";

type ProductOption = {
  id: string;
  code: string;
  description: string;
  batchTracking?: boolean;
  isActive: boolean;
};

type LocationOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type BatchRow = {
  id: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  batchNo: string;
  expiryDate: string | null;
  balance: number;
  locationSummary: string;
  linkedSerialCount: number;
  usageCount: number;
  isArchived: boolean;
  archivedAt: string | null;
  status: "ACTIVE" | "ZERO_BALANCE" | "ARCHIVED";
  createdAt: string | null;
  updatedAt: string | null;
};

type BatchDetail = {
  batch: BatchRow;
  locations: Array<{ locationId: string; locationLabel: string; balance: number }>;
  serials: Array<{ id: string; serialNo: string; status: string; currentLocationLabel: string }>;
  history: Array<{
    id: string;
    movementDate: string;
    movementType: string;
    movementDirection: string;
    qty: number;
    locationLabel: string;
    referenceNo: string | null;
    remarks: string | null;
  }>;
};

type Props = {
  initialRows: BatchRow[];
  products: ProductOption[];
  locations: LocationOption[];
};

function formatNumber(value: number, decimalPlaces: number) {
  return formatNumberByDecimalPlaces(value, decimalPlaces);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function statusBadge(status: BatchRow["status"]) {
  switch (status) {
    case "ARCHIVED":
      return "inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/70";
    case "ZERO_BALANCE":
      return "inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200";
    default:
      return "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300";
  }
}

export function AdminBatchNoClient({ initialRows, products, locations }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [qtyDecimalPlaces, setQtyDecimalPlaces] = useState(DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.qtyDecimalPlaces);
  const [productFilter, setProductFilter] = useState("ALL");
  const [batchKeyword, setBatchKeyword] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | BatchRow["status"]>("ALL");
  const [zeroBalanceOnly, setZeroBalanceOnly] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<BatchDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStockSettings() {
      try {
        const response = await fetch("/api/admin/settings/stock", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok || cancelled) return;
        setQtyDecimalPlaces(normalizeStockNumberFormatConfig(data.config).qtyDecimalPlaces);
      } catch {}
    }
    void loadStockSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = batchKeyword.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesProduct = productFilter === "ALL" || item.inventoryProductId === productFilter;
      const matchesKeyword = !keyword || item.batchNo.toLowerCase().includes(keyword) || item.productCode.toLowerCase().includes(keyword) || item.productDescription.toLowerCase().includes(keyword);
      const matchesLocation = locationFilter === "ALL" || item.locationSummary.toLowerCase().includes(locationFilter.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      const matchesZero = !zeroBalanceOnly || item.balance <= 0;
      return matchesProduct && matchesKeyword && matchesLocation && matchesStatus && matchesZero;
    });
  }, [rows, productFilter, batchKeyword, locationFilter, statusFilter, zeroBalanceOnly]);

  async function openDetail(id: string) {
    setSubmitError("");
    setLoadingDetailId(id);
    try {
      const response = await fetch(`/api/admin/stock/batch-no/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to load batch detail.");
        return;
      }
      setSelectedDetail(data.detail as BatchDetail);
    } catch {
      setSubmitError("Unable to load batch detail right now.");
    } finally {
      setLoadingDetailId(null);
    }
  }

  async function handleAction(id: string, action: "archive" | "restore") {
    setActioningId(id);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const response = await fetch(`/api/admin/stock/batch-no/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || `Unable to ${action} batch.`);
        return;
      }
      const saved = data.batch as BatchRow;
      setRows((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      if (selectedDetail?.batch.id === saved.id) {
        setSelectedDetail((prev) => (prev ? { ...prev, batch: saved } : prev));
      }
      setSubmitSuccess(action === "archive" ? "Batch archived successfully." : "Batch restored successfully.");
    } catch {
      setSubmitError(`Unable to ${action} batch right now.`);
    } finally {
      setActioningId(null);
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Batch No</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Batch Traceability</h2>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:min-w-[920px] xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(160px,0.8fr)_auto]">
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
                <option value="ALL">All Product</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <input className="input-rk w-full min-w-0" value={batchKeyword} onChange={(e) => setBatchKeyword(e.target.value)} placeholder="Search batch / product" />
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                <option value="ALL">All Location</option>
                {locations.map((item) => <option key={item.id} value={`${item.code} — ${item.name}`}>{item.code} — {item.name}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="ZERO_BALANCE">Zero Balance</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
              <input type="checkbox" checked={zeroBalanceOnly} onChange={(e) => setZeroBalanceOnly(e.target.checked)} />
              <span>Zero Balance only</span>
            </label>
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
                <th className="px-3 py-3 font-medium">Product Code</th>
                <th className="px-3 py-3 font-medium">Product Description</th>
                <th className="px-3 py-3 font-medium">Batch No</th>
                <th className="px-3 py-3 font-medium">Expiry Date</th>
                <th className="px-3 py-3 font-medium text-right">Balance</th>
                <th className="px-3 py-3 font-medium">Location</th>
                <th className="px-3 py-3 font-medium text-right">Linked Serial</th>
                <th className="px-3 py-3 font-medium text-right">Usage Count</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-white/50">No batch records found.</td></tr>
              ) : filteredRows.map((item) => (
                <tr key={item.id} className="align-top text-white/80">
                  <td className="px-3 py-4 font-semibold text-white">{item.productCode}</td>
                  <td className="px-3 py-4">{item.productDescription}</td>
                  <td className="px-3 py-4 font-medium text-white">{item.batchNo}</td>
                  <td className="px-3 py-4">{formatDate(item.expiryDate)}</td>
                  <td className="px-3 py-4 text-right font-medium text-white">{formatNumber(item.balance, qtyDecimalPlaces)}</td>
                  <td className="px-3 py-4 text-white/70">{item.locationSummary || "—"}</td>
                  <td className="px-3 py-4 text-right">{item.linkedSerialCount}</td>
                  <td className="px-3 py-4 text-right">{item.usageCount}</td>
                  <td className="px-3 py-4"><span className={statusBadge(item.status)}>{item.status === "ZERO_BALANCE" ? "Zero Balance" : item.status === "ARCHIVED" ? "Archived" : "Active"}</span></td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openDetail(item.id)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
                        {loadingDetailId === item.id ? "Loading..." : "View"}
                      </button>
                      {item.isArchived ? (
                        <button type="button" disabled={actioningId === item.id} onClick={() => handleAction(item.id, "restore")} className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-60">Restore</button>
                      ) : (
                        <button type="button" disabled={actioningId === item.id} onClick={() => handleAction(item.id, "archive")} className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-60">Archive</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDetail ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Batch Detail</p>
                <h2 className="mt-3 text-2xl font-bold text-white">{selectedDetail.batch.productCode} — {selectedDetail.batch.batchNo}</h2>
                <p className="mt-3 text-sm text-white/70">{selectedDetail.batch.productDescription}</p>
              </div>
              <button type="button" onClick={() => setSelectedDetail(null)} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Close</button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Balance</p><p className="mt-3 text-2xl font-bold text-white">{formatNumber(selectedDetail.batch.balance, qtyDecimalPlaces)}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Linked Serial</p><p className="mt-3 text-2xl font-bold text-white">{selectedDetail.batch.linkedSerialCount}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Usage Count</p><p className="mt-3 text-2xl font-bold text-white">{selectedDetail.batch.usageCount}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Status</p><p className="mt-3"><span className={statusBadge(selectedDetail.batch.status)}>{selectedDetail.batch.status === "ZERO_BALANCE" ? "Zero Balance" : selectedDetail.batch.status === "ARCHIVED" ? "Archived" : "Active"}</span></p></div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
                <h3 className="text-lg font-semibold text-white">Location Balance</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead><tr className="text-left text-white/45"><th className="px-3 py-3 font-medium">Location</th><th className="px-3 py-3 font-medium text-right">Balance</th></tr></thead>
                    <tbody className="divide-y divide-white/10">
                      {selectedDetail.locations.length === 0 ? <tr><td colSpan={2} className="px-3 py-6 text-center text-white/50">No active location balance.</td></tr> : selectedDetail.locations.map((row) => <tr key={row.locationId}><td className="px-3 py-3 text-white/80">{row.locationLabel}</td><td className="px-3 py-3 text-right text-white">{formatNumber(row.balance)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
                <h3 className="text-lg font-semibold text-white">Linked Serial</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead><tr className="text-left text-white/45"><th className="px-3 py-3 font-medium">Serial No</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Current Location</th></tr></thead>
                    <tbody className="divide-y divide-white/10">
                      {selectedDetail.serials.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-white/50">No linked serial.</td></tr> : selectedDetail.serials.map((row) => <tr key={row.id}><td className="px-3 py-3 text-white">{row.serialNo}</td><td className="px-3 py-3 text-white/75">{row.status === "IN_STOCK" ? "In Stock" : "Out of Stock"}</td><td className="px-3 py-3 text-white/75">{row.currentLocationLabel}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Transaction History</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-white/45"><th className="px-3 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Type</th><th className="px-3 py-3 font-medium">Direction</th><th className="px-3 py-3 font-medium text-right">Qty</th><th className="px-3 py-3 font-medium">Location</th><th className="px-3 py-3 font-medium">Reference</th><th className="px-3 py-3 font-medium">Remarks</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {selectedDetail.history.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-white/50">No transaction history found.</td></tr> : selectedDetail.history.map((row) => <tr key={row.id}><td className="px-3 py-3 text-white/75">{formatDate(row.movementDate)}</td><td className="px-3 py-3 text-white">{row.movementType}</td><td className="px-3 py-3 text-white/75">{row.movementDirection}</td><td className="px-3 py-3 text-right text-white">{formatNumber(row.qty)}</td><td className="px-3 py-3 text-white/75">{row.locationLabel}</td><td className="px-3 py-3 text-white/75">{row.referenceNo || "—"}</td><td className="px-3 py-3 text-white/60">{row.remarks || "—"}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
