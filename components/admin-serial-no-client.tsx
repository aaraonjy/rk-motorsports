"use client";

import { useMemo, useState } from "react";

type ProductOption = {
  id: string;
  code: string;
  description: string;
  serialNumberTracking?: boolean;
  isActive: boolean;
};

type LocationOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type SerialRow = {
  id: string;
  serialNo: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  batchNo: string | null;
  currentLocationId: string | null;
  currentLocationLabel: string;
  status: "IN_STOCK" | "OUT_OF_STOCK";
  lastTransaction: string | null;
  lastTransactionType: string | null;
  lastDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type SerialDetail = {
  serial: SerialRow;
  history: Array<{
    id: string;
    serialNo: string;
    transactionNo: string | null;
    transactionType: string | null;
    transactionDate: string | null;
    lineRemarks: string | null;
    fromLocationLabel: string;
    toLocationLabel: string;
    batchNo: string | null;
  }>;
};

type Props = {
  initialRows: SerialRow[];
  products: ProductOption[];
  locations: LocationOption[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export function AdminSerialNoClient({ initialRows, products, locations }: Props) {
  const [rows] = useState(initialRows);
  const [serialKeyword, setSerialKeyword] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [batchFilter, setBatchFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SerialRow["status"]>("ALL");
  const [selectedDetail, setSelectedDetail] = useState<SerialDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const filteredRows = useMemo(() => {
    const serialQ = serialKeyword.trim().toLowerCase();
    const batchQ = batchFilter.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesSerial = !serialQ || item.serialNo.toLowerCase().includes(serialQ) || item.productCode.toLowerCase().includes(serialQ) || item.productDescription.toLowerCase().includes(serialQ);
      const matchesProduct = productFilter === "ALL" || item.inventoryProductId === productFilter;
      const matchesBatch = !batchQ || (item.batchNo || "").toLowerCase().includes(batchQ);
      const matchesLocation = locationFilter === "ALL" || item.currentLocationId === locationFilter;
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      return matchesSerial && matchesProduct && matchesBatch && matchesLocation && matchesStatus;
    });
  }, [rows, serialKeyword, productFilter, batchFilter, locationFilter, statusFilter]);

  async function openDetail(id: string) {
    setError("");
    setLoadingDetailId(id);
    try {
      const response = await fetch(`/api/admin/stock/serial-no/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to load serial detail.");
        return;
      }
      setSelectedDetail(data.detail as SerialDetail);
    } catch {
      setError("Unable to load serial detail right now.");
    } finally {
      setLoadingDetailId(null);
    }
  }

  return (
    <>
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Serial No</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Serial Traceability</h2>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:min-w-[920px] xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(160px,0.9fr)_minmax(180px,1fr)_minmax(160px,0.8fr)]">
            <input className="input-rk w-full min-w-0" value={serialKeyword} onChange={(e) => setSerialKeyword(e.target.value)} placeholder="Search serial / product" />
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
                <option value="ALL">All Product</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <input className="input-rk w-full min-w-0" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} placeholder="Filter batch no" />
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                <option value="ALL">All Location</option>
                {locations.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
            <div className="relative min-w-0">
              <select className="input-rk w-full appearance-none pr-12" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="ALL">All Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
            </div>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-white/45">
                <th className="px-3 py-3 font-medium">Serial No</th>
                <th className="px-3 py-3 font-medium">Product</th>
                <th className="px-3 py-3 font-medium">Batch No</th>
                <th className="px-3 py-3 font-medium">Current Location</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Last Transaction</th>
                <th className="px-3 py-3 font-medium">Last Date</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredRows.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-white/50">No serial records found.</td></tr> : filteredRows.map((item) => (
                <tr key={item.id} className="align-top text-white/80">
                  <td className="px-3 py-4 font-semibold text-white">{item.serialNo}</td>
                  <td className="px-3 py-4"><div className="font-medium text-white">{item.productCode}</div><div className="text-white/60">{item.productDescription}</div></td>
                  <td className="px-3 py-4 text-white/75">{item.batchNo || "—"}</td>
                  <td className="px-3 py-4 text-white/75">{item.currentLocationLabel}</td>
                  <td className="px-3 py-4">{item.status === "IN_STOCK" ? <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">In Stock</span> : <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/65">Out of Stock</span>}</td>
                  <td className="px-3 py-4 text-white/75">{item.lastTransaction || "—"}{item.lastTransactionType ? <div className="text-xs text-white/45">{item.lastTransactionType}</div> : null}</td>
                  <td className="px-3 py-4 text-white/75">{formatDate(item.lastDate)}</td>
                  <td className="px-3 py-4"><div className="flex justify-end"><button type="button" onClick={() => openDetail(item.id)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">{loadingDetailId === item.id ? "Loading..." : "Trace"}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDetail ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b0b0f] p-6 shadow-2xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Serial Detail</p>
                <h2 className="mt-3 text-2xl font-bold text-white">{selectedDetail.serial.serialNo}</h2>
                <p className="mt-3 text-sm text-white/70">{selectedDetail.serial.productCode} — {selectedDetail.serial.productDescription}</p>
              </div>
              <button type="button" onClick={() => setSelectedDetail(null)} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Close</button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Batch No</p><p className="mt-3 text-lg font-bold text-white">{selectedDetail.serial.batchNo || "—"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Current Location</p><p className="mt-3 text-lg font-bold text-white">{selectedDetail.serial.currentLocationLabel}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Status</p><p className="mt-3 text-lg font-bold text-white">{selectedDetail.serial.status === "IN_STOCK" ? "In Stock" : "Out of Stock"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.24em] text-white/40">Last Date</p><p className="mt-3 text-lg font-bold text-white">{formatDate(selectedDetail.serial.lastDate)}</p></div>
            </div>

            <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/20 p-5">
              <h3 className="text-lg font-semibold text-white">Movement History</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-white/45"><th className="px-3 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Transaction</th><th className="px-3 py-3 font-medium">Type</th><th className="px-3 py-3 font-medium">From</th><th className="px-3 py-3 font-medium">To</th><th className="px-3 py-3 font-medium">Batch</th><th className="px-3 py-3 font-medium">Remarks</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {selectedDetail.history.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-white/50">No movement history found.</td></tr> : selectedDetail.history.map((row) => <tr key={row.id}><td className="px-3 py-3 text-white/75">{formatDate(row.transactionDate)}</td><td className="px-3 py-3 text-white">{row.transactionNo || "—"}</td><td className="px-3 py-3 text-white/75">{row.transactionType || "—"}</td><td className="px-3 py-3 text-white/75">{row.fromLocationLabel}</td><td className="px-3 py-3 text-white/75">{row.toLocationLabel}</td><td className="px-3 py-3 text-white/75">{row.batchNo || "—"}</td><td className="px-3 py-3 text-white/60">{row.lineRemarks || "—"}</td></tr>)}
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
