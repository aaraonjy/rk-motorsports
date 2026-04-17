"use client";

import { useMemo, useState } from "react";

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
  };
  locations: StockLocationOption[];
};

export function AdminStockConfigurationClient({ initialConfig, locations }: Props) {
  const [form, setForm] = useState(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeLocations = useMemo(
    () => locations.filter((item) => item.isActive),
    [locations]
  );

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
        headers: {
          "Content-Type": "application/json",
        },
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
          Batch A only prepares the stock configuration foundation. Product Master remains usable even when stock control is disabled.
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
              <p className="mt-2 text-xs text-white/45">Batch A locks costing method to Average only.</p>
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
              {!stockControlEnabled ? (
                <p className="mt-2 text-xs text-white/45">Default location is only required when Stock Control is enabled.</p>
              ) : null}
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
          <h3 className="mt-3 text-xl font-bold text-white">Batch A Rules</h3>
          <div className="mt-6 space-y-4 text-sm leading-6 text-white/70">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-semibold text-white">When stock module is OFF</div>
              <div className="mt-2">Product List and product picker stay usable, but no stock movement, stock transaction, or stock report logic is triggered. Stock Location master data should still remain accessible.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-semibold text-white">When stock module is ON</div>
              <div className="mt-2">Stock settings only prepare configuration. Product-level Serial Tracking and Batch Tracking are maintained in Product Master.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-semibold text-white">Default location</div>
              <div className="mt-2">Used as the auto-filled posting location when Multi Location is disabled, and as the fallback stock posting base.</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Available Locations</p>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-white/45">
                  <th className="px-3 py-3 font-medium">Code</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/80">
                {locations.map((location) => (
                  <tr key={location.id}>
                    <td className="px-3 py-4 font-semibold text-white">{location.code}</td>
                    <td className="px-3 py-4">{location.name}</td>
                    <td className="px-3 py-4">{location.isActive ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </form>
  );
}
