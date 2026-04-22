"use client";

import { useMemo, useState } from "react";
import {
  MoneyDecimalPlaces,
  QtyDecimalPlaces,
} from "@/lib/stock-format";

type StockLocationOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type Props = {
  initialConfig: {
    stockModuleEnabled: boolean;
    multiLocationEnabled: boolean;
    allowNegativeStock: boolean;
    costingMethod: "AVERAGE";
    defaultLocationId: string;
    qtyDecimalPlaces: QtyDecimalPlaces;
    unitCostDecimalPlaces: MoneyDecimalPlaces;
    priceDecimalPlaces: MoneyDecimalPlaces;
    allowDocNoOverrideOB: boolean;
    allowDocNoOverrideSR: boolean;
    allowDocNoOverrideSI: boolean;
    allowDocNoOverrideSA: boolean;
    allowDocNoOverrideST: boolean;
    allowDocNoOverrideAS: boolean;
  };
  locations: StockLocationOption[];
};

const transactionTypeOptions = [
  ["allowDocNoOverrideOB", "Opening Stock"],
  ["allowDocNoOverrideSR", "Stock Receive"],
  ["allowDocNoOverrideSI", "Stock Issue"],
  ["allowDocNoOverrideSA", "Stock Adjustment"],
  ["allowDocNoOverrideST", "Stock Transfer"],
  ["allowDocNoOverrideAS", "Stock Assembly"],
] as const;

export function AdminStockConfigurationClient({ initialConfig, locations }: Props) {
  const [form, setForm] = useState(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeLocations = useMemo(() => locations.filter((item) => item.isActive), [locations]);
  const stockControlEnabled = form.stockModuleEnabled;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");

    if (stockControlEnabled && !form.defaultLocationId) {
      setError("Default stock location is required when Stock Control is enabled.");
      setIsSaving(false);
      return;
    }

    try {
      const payload = stockControlEnabled
        ? form
        : {
            ...form,
            multiLocationEnabled: false,
            allowNegativeStock: false,
            defaultLocationId: "",
          };

      const response = await fetch("/api/admin/settings/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to save stock settings.");
        return;
      }

      setSuccess("Stock settings saved successfully.");
    } catch {
      setError("Unable to save stock settings right now.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Global Settings</p>
        <h2 className="mt-3 text-2xl font-bold text-white">Stock Module Settings</h2>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/65">
          Configure stock control foundation, input precision, and per-transaction document number override permissions.
        </p>

        <div className="mt-8 space-y-5">
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.stockModuleEnabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    stockModuleEnabled: e.target.checked,
                    multiLocationEnabled: e.target.checked ? prev.multiLocationEnabled : false,
                    allowNegativeStock: e.target.checked ? prev.allowNegativeStock : false,
                    defaultLocationId: e.target.checked ? prev.defaultLocationId : "",
                  }))
                }
              />
              <span>Enable Stock Control</span>
            </label>
            <label className={`flex items-center gap-3 ${stockControlEnabled ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={form.multiLocationEnabled}
                disabled={!stockControlEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, multiLocationEnabled: e.target.checked }))}
              />
              <span>Enable Multi Location</span>
            </label>
            <label className={`flex items-center gap-3 ${stockControlEnabled ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={form.allowNegativeStock}
                disabled={!stockControlEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, allowNegativeStock: e.target.checked }))}
              />
              <span>Allow Negative Stock</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label-rk">Costing Method</label>
              <div className="relative">
                <select className="input-rk appearance-none pr-12" value={form.costingMethod} onChange={(e) => setForm((prev) => ({ ...prev, costingMethod: e.target.value as "AVERAGE" }))}>
                  <option value="AVERAGE">Average</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
              <p className="mt-2 text-xs text-white/45">Costing method is currently fixed to Average.</p>
            </div>
            <div>
              <label className="label-rk">Default Stock Location</label>
              <div className="relative">
                <select
                  className={`input-rk appearance-none pr-12 ${stockControlEnabled ? "" : "cursor-not-allowed opacity-60"}`}
                  value={form.defaultLocationId}
                  disabled={!stockControlEnabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, defaultLocationId: e.target.value }))}
                >
                  <option value="">Select location</option>
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>{location.code} — {location.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label-rk">Qty Input Format</label>
              <div className="relative">
                <select className="input-rk appearance-none pr-12" value={form.qtyDecimalPlaces} onChange={(e) => setForm((prev) => ({ ...prev, qtyDecimalPlaces: Number(e.target.value) as QtyDecimalPlaces }))}>
                  <option value={0}>No Decimal</option>
                  <option value={2}>2 Decimal Point</option>
                  <option value={3}>3 Decimal Point</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>
            <div>
              <label className="label-rk">Unit Cost Input Format</label>
              <div className="relative">
                <select className="input-rk appearance-none pr-12" value={form.unitCostDecimalPlaces} onChange={(e) => setForm((prev) => ({ ...prev, unitCostDecimalPlaces: Number(e.target.value) as MoneyDecimalPlaces }))}>
                  <option value={2}>2 Decimal Point</option>
                  <option value={3}>3 Decimal Point</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>
            <div>
              <label className="label-rk">Price Input Format</label>
              <div className="relative">
                <select className="input-rk appearance-none pr-12" value={form.priceDecimalPlaces} onChange={(e) => setForm((prev) => ({ ...prev, priceDecimalPlaces: Number(e.target.value) as MoneyDecimalPlaces }))}>
                  <option value={2}>2 Decimal Point</option>
                  <option value={3}>3 Decimal Point</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="font-semibold text-white">Allow Modify Doc No</div>
            <p className="mt-2 text-sm text-white/55">Choose which stock transaction types are allowed to override the system generated document number.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {transactionTypeOptions.map(([key, label]) => (
                <label key={key} className={`flex items-center gap-3 text-sm text-white/75 ${stockControlEnabled ? "" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    checked={form[key]}
                    disabled={!stockControlEnabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

          <button disabled={isSaving} className="inline-flex min-w-[190px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? "Saving..." : "Save Stock Settings"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Behavior</p>
          <h3 className="mt-3 text-xl font-bold text-white">Stock Rules</h3>
          <div className="mt-6 space-y-4 text-sm leading-6 text-white/70">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-semibold text-white">Document numbers</div>
              <div className="mt-2">System transaction number stays internal. Document No is user-facing, unique, max 30 characters, and can only be overridden for enabled transaction types.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-semibold text-white">Input format behavior</div>
              <div className="mt-2">Qty format is applied across stock transactions, stock assembly, assembly template, and read-only stock displays. Unit Cost and Price formats are applied across Product Master input and display screens.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-semibold text-white">Project / Department</div>
              <div className="mt-2">Project and Department master data are maintained under Global Settings → Misc and can be linked to stock transaction documents for future filtering and reporting.</div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
