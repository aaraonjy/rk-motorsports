"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TaxCodeItem = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: "EXCLUSIVE" | "INCLUSIVE";
  isActive: boolean;
};

type TaxConfigurationClientProps = {
  initialConfig: {
    taxModuleEnabled: boolean;
    defaultPortalTaxCodeId: string;
    defaultAdminTaxCodeId: string;
  };
  taxCodes: TaxCodeItem[];
};

type TaxCodeDraft = TaxCodeItem & {
  isSaving?: boolean;
};

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function createEmptyTaxCodeDraft(): Omit<TaxCodeDraft, "id"> {
  return {
    code: "",
    description: "",
    rate: 0,
    calculationMethod: "EXCLUSIVE",
    isActive: true,
  };
}

export function AdminTaxConfigurationClient({
  initialConfig,
  taxCodes,
}: TaxConfigurationClientProps) {
  const router = useRouter();
  const [taxModuleEnabled, setTaxModuleEnabled] = useState(initialConfig.taxModuleEnabled);
  const [defaultPortalTaxCodeId, setDefaultPortalTaxCodeId] = useState(initialConfig.defaultPortalTaxCodeId);
  const [defaultAdminTaxCodeId, setDefaultAdminTaxCodeId] = useState(initialConfig.defaultAdminTaxCodeId);
  const [configMessage, setConfigMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTaxCode, setNewTaxCode] = useState(createEmptyTaxCodeDraft());
  const [drafts, setDrafts] = useState<TaxCodeDraft[]>(taxCodes);

  const activeTaxCodes = useMemo(
    () => drafts.filter((item) => item.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [drafts]
  );

  function updateDraft(id: string, field: keyof TaxCodeDraft, value: string | number | boolean) {
    setDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  async function handleSaveConfig() {
    setConfigMessage("");
    setConfigError("");
    setIsSavingConfig(true);

    try {
      const response = await fetch("/api/admin/settings/tax-configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxModuleEnabled,
          defaultPortalTaxCodeId: defaultPortalTaxCodeId || null,
          defaultAdminTaxCodeId: defaultAdminTaxCodeId || null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to save tax configuration.");
      }

      setConfigMessage("Tax configuration saved successfully.");
      router.refresh();
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "Unable to save tax configuration.");
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleCreateTaxCode() {
    setCreateMessage("");
    setCreateError("");
    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/settings/tax-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTaxCode),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to create tax code.");
      }

      setCreateMessage("Tax code created successfully.");
      setNewTaxCode(createEmptyTaxCodeDraft());
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create tax code.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveTaxCode(id: string) {
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;

    setDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, isSaving: true } : item)));
    setCreateMessage("");
    setCreateError("");

    try {
      const response = await fetch(`/api/admin/settings/tax-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          description: draft.description,
          rate: draft.rate,
          calculationMethod: draft.calculationMethod,
          isActive: draft.isActive,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to update tax code.");
      }

      setCreateMessage(`Tax code ${draft.code || ""} updated successfully.`);
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to update tax code.");
      setDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, isSaving: false } : item)));
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="card-rk p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Module Configuration</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/65">
              Batch 1 only stores the tax foundation and default tax code selections. Order, invoice, and report tax usage will be integrated in the next batches.
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${taxModuleEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-white/70"}`}>
            {taxModuleEnabled ? "Tax Module Enabled" : "Tax Module Disabled"}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            <span className="mb-2 block text-sm font-semibold text-white">Enable Tax Module</span>
            <span className="mb-3 block text-xs text-white/55">Foundation toggle only. Existing order logic remains unchanged in Batch 1.</span>
            <button
              type="button"
              onClick={() => setTaxModuleEnabled((prev) => !prev)}
              className={`inline-flex h-11 w-full items-center justify-center rounded-xl border font-semibold transition ${taxModuleEnabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"}`}
            >
              {taxModuleEnabled ? "ON" : "OFF"}
            </button>
          </label>

          <label className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            <span className="mb-2 block text-sm font-semibold text-white">Default Portal Tax Code</span>
            <span className="mb-3 block text-xs text-white/55">Used later for Custom Tuning Form auto-applied tax.</span>
            <select
              value={defaultPortalTaxCodeId}
              onChange={(event) => setDefaultPortalTaxCodeId(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            >
              <option value="">No default tax code</option>
              {activeTaxCodes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.description}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            <span className="mb-2 block text-sm font-semibold text-white">Default Admin Tax Code</span>
            <span className="mb-3 block text-xs text-white/55">Used later for Custom Order Form default tax selection.</span>
            <select
              value={defaultAdminTaxCodeId}
              onChange={(event) => setDefaultAdminTaxCodeId(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none"
            >
              <option value="">No default tax code</option>
              {activeTaxCodes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.description}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(configMessage || configError) ? (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${configError ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
            {configError || configMessage}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={isSavingConfig}
            className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingConfig ? "Saving..." : "Save Tax Configuration"}
          </button>
        </div>
      </div>

      <div className="card-rk p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Tax Code Master</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/65">
              Create active/inactive tax codes and define their calculation method. Historical transaction snapshots will rely on these values in later batches.
            </p>
          </div>
          <div className="text-sm text-white/55">{drafts.length} tax code(s)</div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr_0.8fr_0.9fr_1fr_auto]">
            <input
              className="input-rk"
              placeholder="Tax Code"
              value={newTaxCode.code}
              onChange={(event) => setNewTaxCode((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
            />
            <input
              className="input-rk"
              placeholder="Description"
              value={newTaxCode.description}
              onChange={(event) => setNewTaxCode((prev) => ({ ...prev, description: event.target.value }))}
            />
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="input-rk"
              placeholder="Rate"
              value={newTaxCode.rate}
              onChange={(event) => setNewTaxCode((prev) => ({ ...prev, rate: Number(event.target.value || 0) }))}
            />
            <select
              className="input-rk"
              value={newTaxCode.calculationMethod}
              onChange={(event) => setNewTaxCode((prev) => ({ ...prev, calculationMethod: event.target.value as TaxCodeItem["calculationMethod"] }))}
            >
              <option value="EXCLUSIVE">Exclusive</option>
              <option value="INCLUSIVE">Inclusive</option>
            </select>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={newTaxCode.isActive}
                onChange={(event) => setNewTaxCode((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active tax code
            </label>
            <button
              type="button"
              onClick={handleCreateTaxCode}
              disabled={isCreating}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Creating..." : "Create Tax Code"}
            </button>
          </div>
        </div>

        {(createMessage || createError) ? (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${createError ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
            {createError || createMessage}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {drafts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/55">
              No tax codes have been created yet.
            </div>
          ) : null}

          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr_0.8fr_0.9fr_1fr_auto]">
                <input
                  className="input-rk"
                  value={draft.code}
                  onChange={(event) => updateDraft(draft.id, "code", event.target.value.toUpperCase())}
                />
                <input
                  className="input-rk"
                  value={draft.description}
                  onChange={(event) => updateDraft(draft.id, "description", event.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input-rk"
                  value={draft.rate}
                  onChange={(event) => updateDraft(draft.id, "rate", Number(event.target.value || 0))}
                />
                <select
                  className="input-rk"
                  value={draft.calculationMethod}
                  onChange={(event) => updateDraft(draft.id, "calculationMethod", event.target.value as TaxCodeItem["calculationMethod"])}
                >
                  <option value="EXCLUSIVE">Exclusive</option>
                  <option value="INCLUSIVE">Inclusive</option>
                </select>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(event) => updateDraft(draft.id, "isActive", event.target.checked)}
                    />
                    Active
                  </label>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${draft.isActive ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border border-white/15 bg-white/5 text-white/60"}`}>
                    {draft.isActive ? formatPercent(draft.rate) : "Inactive"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveTaxCode(draft.id)}
                  disabled={draft.isSaving}
                  className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {draft.isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
