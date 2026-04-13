"use client";

import { useMemo, useState } from "react";

type TaxCodeItem = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: "EXCLUSIVE" | "INCLUSIVE";
  isActive: boolean;
};

type Props = {
  initialConfig: {
    taxModuleEnabled: boolean;
    defaultPortalTaxCodeId: string;
    defaultAdminTaxCodeId: string;
  };
  taxCodes: TaxCodeItem[];
};

type MessageState = { type: "success" | "error"; text: string } | null;

type EditableTaxCode = TaxCodeItem & { isSaving?: boolean };

const selectClassName =
  "w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-white outline-none transition focus:border-red-400/50 pr-12 appearance-none bg-[right_0.9rem_center] bg-no-repeat";
const inputClassName =
  "w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-white outline-none transition focus:border-red-400/50";

export function AdminTaxConfigurationClient({ initialConfig, taxCodes }: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [taxCodeRows, setTaxCodeRows] = useState<EditableTaxCode[]>(taxCodes);
  const [configMessage, setConfigMessage] = useState<MessageState>(null);
  const [taxCodeMessage, setTaxCodeMessage] = useState<MessageState>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [newTaxCode, setNewTaxCode] = useState({
    code: "",
    description: "",
    rate: "0",
    calculationMethod: "EXCLUSIVE" as "EXCLUSIVE" | "INCLUSIVE",
    isActive: true,
  });
  const [isCreatingCode, setIsCreatingCode] = useState(false);
  const [pendingModuleToggle, setPendingModuleToggle] = useState<boolean | null>(null);
  const [isCreateRowOpen, setIsCreateRowOpen] = useState(false);

  const selectStyle = {
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22 fill=%22none%22%3E%3Cpath d=%22M1 1.5L6 6.5L11 1.5%22 stroke=%22%23ffffff%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-opacity=%220.82%22/%3E%3C/svg%3E")',
    backgroundSize: "12px 8px",
  } as const;

  const activeTaxCodes = useMemo(() => taxCodeRows.filter((item) => item.isActive), [taxCodeRows]);

  const hasConfigChanges =
    config.defaultPortalTaxCodeId !== initialConfig.defaultPortalTaxCodeId ||
    config.defaultAdminTaxCodeId !== initialConfig.defaultAdminTaxCodeId;

  async function saveConfiguration(nextConfig = config) {
    setIsSavingConfig(true);
    setConfigMessage(null);
    try {
      const response = await fetch("/api/admin/settings/tax-configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to save tax configuration.");
      }
      setConfig(nextConfig);
      setConfigMessage({ type: "success", text: "Tax configuration saved successfully." });
    } catch (error) {
      setConfigMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to save tax configuration." });
    } finally {
      setIsSavingConfig(false);
    }
  }

  function handleModuleToggle() {
    setPendingModuleToggle(!config.taxModuleEnabled);
  }

  async function confirmModuleToggle() {
    if (pendingModuleToggle === null) return;
    const nextConfig = { ...config, taxModuleEnabled: pendingModuleToggle };
    setPendingModuleToggle(null);
    setConfig(nextConfig);
    await saveConfiguration(nextConfig);
  }

  function closeModuleToggleModal() {
    setPendingModuleToggle(null);
  }

  async function createTaxCode() {
    setIsCreatingCode(true);
    setTaxCodeMessage(null);
    try {
      const response = await fetch("/api/admin/settings/tax-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newTaxCode.code,
          description: newTaxCode.description,
          rate: Number(newTaxCode.rate || 0),
          calculationMethod: newTaxCode.calculationMethod,
          isActive: newTaxCode.isActive,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to create tax code.");
      }
      setTaxCodeRows((prev) => [
        ...prev,
        {
          id: payload.id,
          code: newTaxCode.code.trim().toUpperCase(),
          description: newTaxCode.description.trim(),
          rate: Number(newTaxCode.rate || 0),
          calculationMethod: newTaxCode.calculationMethod,
          isActive: newTaxCode.isActive,
        },
      ]);
      setNewTaxCode({ code: "", description: "", rate: "0", calculationMethod: "EXCLUSIVE", isActive: true });
      setTaxCodeMessage({ type: "success", text: "Tax code created successfully." });
      setIsCreateRowOpen(false);
    } catch (error) {
      setTaxCodeMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to create tax code." });
    } finally {
      setIsCreatingCode(false);
    }
  }

  async function saveTaxCode(row: EditableTaxCode) {
    setTaxCodeRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, isSaving: true } : item)));
    setTaxCodeMessage(null);
    try {
      const response = await fetch(`/api/admin/settings/tax-codes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: row.code,
          description: row.description,
          rate: row.rate,
          calculationMethod: row.calculationMethod,
          isActive: row.isActive,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to update tax code.");
      }
      setTaxCodeMessage({ type: "success", text: `Tax code ${row.code} updated successfully.` });
    } catch (error) {
      setTaxCodeMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to update tax code." });
    } finally {
      setTaxCodeRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, isSaving: false } : item)));
    }
  }

  function updateRow(id: string, patch: Partial<EditableTaxCode>) {
    setTaxCodeRows((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Module Configuration</h2>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${config.taxModuleEnabled ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200" : "border-white/12 bg-white/5 text-white/75"}`}>
              {config.taxModuleEnabled ? "Tax Module Enabled" : "Tax Module Disabled"}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="text-lg font-semibold">Enable Tax Module</div>
              <p className="mt-2 text-sm text-white/65">Toggle tax usage for configured order flows. Historical taxed orders remain unchanged.</p>
              <div className="mt-5 flex min-h-[56px] items-end">
                <button
                  type="button"
                  onClick={handleModuleToggle}
                  className={`inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${config.taxModuleEnabled ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20" : "border-white/12 bg-white/[0.04] text-white/85 hover:bg-white/[0.08]"}`}
                >
                  {config.taxModuleEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <label className="text-lg font-semibold">Default Portal Tax Code</label>
              <p className="mt-2 text-sm text-white/65">Used later for Custom Tuning Form auto-applied tax.</p>
              <select
                value={config.defaultPortalTaxCodeId}
                onChange={(event) => setConfig((prev) => ({ ...prev, defaultPortalTaxCodeId: event.target.value }))}
                className={`${selectClassName} mt-5`}
                style={selectStyle}
              >
                <option value="">No default tax code</option>
                {activeTaxCodes.map((taxCode) => (
                  <option key={taxCode.id} value={taxCode.id}>
                    {taxCode.code} - {taxCode.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <label className="text-lg font-semibold">Default Admin Tax Code</label>
              <p className="mt-2 text-sm text-white/65">Used later for Custom Order Form default tax selection.</p>
              <select
                value={config.defaultAdminTaxCodeId}
                onChange={(event) => setConfig((prev) => ({ ...prev, defaultAdminTaxCodeId: event.target.value }))}
                className={`${selectClassName} mt-5`}
                style={selectStyle}
              >
                <option value="">No default tax code</option>
                {activeTaxCodes.map((taxCode) => (
                  <option key={taxCode.id} value={taxCode.id}>
                    {taxCode.code} - {taxCode.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {configMessage ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${configMessage.type === "success" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100" : "border-red-500/30 bg-red-500/15 text-red-100"}`}>
              {configMessage.text}
            </div>
          ) : null}

          {hasConfigChanges ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => saveConfiguration()}
                disabled={isSavingConfig}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-white/12 bg-black/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSavingConfig ? "Saving..." : "Save Tax Configuration"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Tax Code Master</h2>
          </div>
          <div className="text-sm text-white/65">{activeTaxCodes.length} tax code(s)</div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setIsCreateRowOpen((prev) => !prev)}
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-white/12 bg-black/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {isCreateRowOpen ? "Close Create Tax Code" : "Create Tax Code"}
          </button>
        </div>

        {isCreateRowOpen ? (
          <div className="mt-6 grid gap-3 md:grid-cols-[1.1fr_1.6fr_0.8fr_1fr_1fr_auto]">
            <input className={inputClassName} placeholder="Tax Code" value={newTaxCode.code} onChange={(e) => setNewTaxCode((prev) => ({ ...prev, code: e.target.value }))} />
            <input className={inputClassName} placeholder="Description" value={newTaxCode.description} onChange={(e) => setNewTaxCode((prev) => ({ ...prev, description: e.target.value }))} />
            <input className={inputClassName} placeholder="0" type="number" min="0" max="100" step="0.01" value={newTaxCode.rate} onChange={(e) => setNewTaxCode((prev) => ({ ...prev, rate: e.target.value }))} />
            <select className={selectClassName} style={selectStyle} value={newTaxCode.calculationMethod} onChange={(e) => setNewTaxCode((prev) => ({ ...prev, calculationMethod: e.target.value as "EXCLUSIVE" | "INCLUSIVE" }))}>
              <option value="EXCLUSIVE">Exclusive</option>
              <option value="INCLUSIVE">Inclusive</option>
            </select>
            <label className="flex min-h-[50px] items-center gap-3 rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-sm text-white/85">
              <input type="checkbox" checked={newTaxCode.isActive} onChange={(e) => setNewTaxCode((prev) => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-white/15 bg-black/40" />
              Active tax code
            </label>
            <button type="button" onClick={createTaxCode} disabled={isCreatingCode} className="inline-flex min-h-[50px] items-center justify-center rounded-2xl border border-white/12 bg-black/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70">
              {isCreatingCode ? "Creating..." : "Save New Tax Code"}
            </button>
          </div>
        ) : null}

        {taxCodeMessage ? (
          <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${taxCodeMessage.type === "success" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100" : "border-red-500/30 bg-red-500/15 text-red-100"}`}>
            {taxCodeMessage.text}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {activeTaxCodes.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/65">No active tax codes have been created yet.</div>
          ) : (
            activeTaxCodes.map((row) => (
              <div key={row.id} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="grid gap-3 md:grid-cols-[1.1fr_1.6fr_0.8fr_1fr_1fr_auto] md:items-center">
                  <input className={inputClassName} value={row.code} onChange={(e) => updateRow(row.id, { code: e.target.value.toUpperCase() })} />
                  <input className={inputClassName} value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} />
                  <input className={inputClassName} type="number" min="0" max="100" step="0.01" value={row.rate} onChange={(e) => updateRow(row.id, { rate: Number(e.target.value || 0) })} />
                  <select className={selectClassName} style={selectStyle} value={row.calculationMethod} onChange={(e) => updateRow(row.id, { calculationMethod: e.target.value as "EXCLUSIVE" | "INCLUSIVE" })}>
                    <option value="EXCLUSIVE">Exclusive</option>
                    <option value="INCLUSIVE">Inclusive</option>
                  </select>
                  <div className="flex min-h-[50px] items-center justify-between gap-3 rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-sm text-white/85">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={row.isActive} onChange={(e) => updateRow(row.id, { isActive: e.target.checked })} className="h-4 w-4 rounded border-white/15 bg-black/40" />
                      Active
                    </label>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                      {Number(row.rate || 0).toFixed(2)}%
                    </span>
                  </div>
                  <button type="button" onClick={() => saveTaxCode(row)} disabled={Boolean(row.isSaving)} className="inline-flex min-h-[50px] items-center justify-center rounded-2xl border border-white/12 bg-black/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70">
                    {row.isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {pendingModuleToggle !== null ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div>
              <h3 className="text-lg font-semibold text-white">
                {pendingModuleToggle ? "Enable Tax Module" : "Disable Tax Module"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/60">
                {pendingModuleToggle
                  ? "Turn ON the Tax Module? This will enable tax usage for configured order flows."
                  : "Turn OFF the Tax Module? Existing historical taxed orders will remain unchanged."}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModuleToggleModal}
                disabled={isSavingConfig}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmModuleToggle}
                disabled={isSavingConfig}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pendingModuleToggle
                    ? "border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                    : "border-red-500/40 text-red-300 hover:bg-red-500/10"
                }`}
              >
                {isSavingConfig ? "Saving..." : pendingModuleToggle ? "Confirm Enable" : "Confirm Disable"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
