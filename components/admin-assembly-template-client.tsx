"use client";

import { useMemo, useState } from "react";

type ProductSummary = {
  id: string;
  code: string;
  description: string;
  itemType: string;
  trackInventory: boolean;
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
};

type ComponentOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
};

type TemplateLineRecord = {
  id: string;
  lineNo: number;
  componentProductId: string;
  componentProductCode: string;
  componentProductDescription: string;
  qty: number;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string | null;
};

type Props = {
  product: ProductSummary;
  componentOptions: ComponentOption[];
  initialRemarks: string;
  initialLines: TemplateLineRecord[];
};

type EditableLine = {
  id?: string;
  lineNo: number;
  componentProductId: string;
  qty: string;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string;
};

function emptyLine(lineNo: number): EditableLine {
  return {
    lineNo,
    componentProductId: "",
    qty: "1",
    uom: "",
    isRequired: true,
    allowOverride: false,
    remarks: "",
  };
}

function normalizeQty(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "1";
  return parsed.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function AdminAssemblyTemplateClient({
  product,
  componentOptions,
  initialRemarks,
  initialLines,
}: Props) {
  const [remarks, setRemarks] = useState(initialRemarks);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length > 0
      ? initialLines.map((line, index) => ({
          id: line.id,
          lineNo: index + 1,
          componentProductId: line.componentProductId,
          qty: String(line.qty),
          uom: line.uom,
          isRequired: line.isRequired,
          allowOverride: line.allowOverride,
          remarks: line.remarks || "",
        }))
      : [emptyLine(1)]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const optionMap = useMemo(() => new Map(componentOptions.map((item) => [item.id, item])), [componentOptions]);

  function renumber(nextLines: EditableLine[]) {
    return nextLines.map((line, index) => ({ ...line, lineNo: index + 1 }));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(prev.length + 1)]);
  }

  function removeLine(lineNo: number) {
    setLines((prev) => {
      const next = prev.filter((line) => line.lineNo !== lineNo);
      return renumber(next.length > 0 ? next : [emptyLine(1)]);
    });
  }

  function updateLine(lineNo: number, updater: (current: EditableLine) => EditableLine) {
    setLines((prev) => prev.map((line) => (line.lineNo === lineNo ? updater(line) : line)));
  }

  async function handleSave() {
    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const payload = {
        remarks: remarks.trim() || null,
        lines: lines.map((line, index) => ({
          id: line.id,
          lineNo: index + 1,
          componentProductId: line.componentProductId,
          qty: Number(normalizeQty(line.qty)),
          uom: line.uom.trim().toUpperCase(),
          isRequired: line.isRequired,
          allowOverride: line.allowOverride,
          remarks: line.remarks.trim() || null,
        })),
      };

      const response = await fetch(`/api/admin/stock/assembly-templates/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to save assembly template.");
        return;
      }

      const savedLines = Array.isArray(data.template?.lines) ? data.template.lines : [];
      setRemarks(data.template?.remarks || "");
      setLines(
        savedLines.length > 0
          ? savedLines.map((line: any, index: number) => ({
              id: line.id,
              lineNo: index + 1,
              componentProductId: line.componentProductId,
              qty: String(Number(line.qty ?? 0)),
              uom: line.uom,
              isRequired: Boolean(line.isRequired),
              allowOverride: Boolean(line.allowOverride),
              remarks: line.remarks || "",
            }))
          : [emptyLine(1)]
      );
      setSubmitSuccess("Assembly template saved successfully.");
    } catch {
      setSubmitError("Unable to save assembly template right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!product.isAssemblyItem) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
        This product is not marked as an Assembly Item. Please go back to Product Master and enable Assembly Item first.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {(submitError || submitSuccess) ? (
        <div className="space-y-3">
          {submitError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}
          {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-5 text-sm text-sky-100">
        <p className="font-semibold">Assembly Template Lines</p>
        <p className="mt-2 text-sky-100/80">
          Define the default BOM / component recipe for this finished good. Batch and serial allocation will still happen during actual Stock Assembly posting.
        </p>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
        <label className="label-rk">Template Remarks</label>
        <textarea
          className="input-rk min-h-[110px]"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Optional remarks for this assembly template"
        />
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Template Lines</p>
            <p className="mt-1 text-xs text-white/45">
              Add component item, qty, UOM, required flag, and allow override setting.
            </p>
          </div>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Add Line
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {lines.map((line) => {
            const selectedComponent = optionMap.get(line.componentProductId) || null;

            return (
              <div key={`${line.id || "new"}-${line.lineNo}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Line {line.lineNo}</div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.lineNo)}
                    className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label-rk">Component Item</label>
                    <select
                      className="input-rk"
                      value={line.componentProductId}
                      onChange={(e) => {
                        const nextProductId = e.target.value;
                        const nextProduct = optionMap.get(nextProductId);
                        updateLine(line.lineNo, (current) => ({
                          ...current,
                          componentProductId: nextProductId,
                          uom: current.uom || nextProduct?.baseUom || "",
                        }));
                      }}
                    >
                      <option value="">Select component item</option>
                      {componentOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.code} — {option.description}
                        </option>
                      ))}
                    </select>
                    {selectedComponent ? (
                      <p className="mt-2 text-xs text-white/45">
                        Base UOM: {selectedComponent.baseUom}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="label-rk">UOM</label>
                    <input
                      className="input-rk"
                      value={line.uom}
                      onChange={(e) => updateLine(line.lineNo, (current) => ({ ...current, uom: e.target.value.toUpperCase() }))}
                      placeholder={selectedComponent?.baseUom || "PCS"}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label-rk">Qty</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      className="input-rk"
                      value={line.qty}
                      onChange={(e) => updateLine(line.lineNo, (current) => ({ ...current, qty: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label-rk">Remarks</label>
                    <input
                      className="input-rk"
                      value={line.remarks}
                      onChange={(e) => updateLine(line.lineNo, (current) => ({ ...current, remarks: e.target.value }))}
                      placeholder="Optional line remarks"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75 md:grid-cols-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={line.isRequired}
                      onChange={(e) => updateLine(line.lineNo, (current) => ({ ...current, isRequired: e.target.checked }))}
                    />
                    <span>Required</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={line.allowOverride}
                      onChange={(e) => updateLine(line.lineNo, (current) => ({ ...current, allowOverride: e.target.checked }))}
                    />
                    <span>Allow Override</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
