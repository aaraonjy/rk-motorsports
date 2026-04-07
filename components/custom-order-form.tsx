"use client";

import { useMemo, useState } from "react";

type CustomOrderFormProps = {
  customerId: string;
};

type CustomLineItem = {
  id: string;
  description: string;
  qty: string;
  unitPrice: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

function createEmptyRow(): CustomLineItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    qty: "1",
    unitPrice: "0",
  };
}

function parseWholeNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CustomOrderForm({ customerId }: CustomOrderFormProps) {
  const [title, setTitle] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [discount, setDiscount] = useState("0");
  const [rows, setRows] = useState<CustomLineItem[]>([createEmptyRow()]);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedRows = useMemo(
    () =>
      rows.map((row) => {
        const qty = Math.max(1, parseWholeNumber(row.qty || "0"));
        const unitPrice = Math.max(0, parseWholeNumber(row.unitPrice || "0"));
        const lineTotal = qty * unitPrice;

        return {
          ...row,
          qty,
          unitPrice,
          lineTotal,
        };
      }),
    [rows]
  );

  const subtotal = useMemo(
    () => normalizedRows.reduce((sum, row) => sum + row.lineTotal, 0),
    [normalizedRows]
  );

  const discountAmount = useMemo(
    () => Math.max(0, parseWholeNumber(discount || "0")),
    [discount]
  );

  const grandTotal = Math.max(subtotal - discountAmount, 0);

  const hasAtLeastOneValidRow = normalizedRows.some(
    (row) => row.description.trim() && row.qty > 0 && row.unitPrice >= 0
  );

  const disableSubmit =
    isSubmitting || !title.trim() || !hasAtLeastOneValidRow || subtotal <= 0;

  function updateRow(
    rowId: string,
    field: keyof Pick<CustomLineItem, "description" | "qty" | "unitPrice">,
    value: string
  ) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => {
      if (prev.length === 1) {
        return [createEmptyRow()];
      }
      return prev.filter((row) => row.id !== rowId);
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (disableSubmit) return;

    const items = normalizedRows
      .filter((row) => row.description.trim())
      .map((row) => ({
        description: row.description.trim(),
        qty: row.qty,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
      }));

    if (items.length === 0) {
      setSubmitError("Please add at least one valid line item.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderType: "CUSTOM_ORDER",
          customerId,
          customTitle: title.trim(),
          internalRemarks: internalRemarks.trim(),
          customSubtotal: subtotal,
          customDiscount: discountAmount,
          customGrandTotal: grandTotal,
          items,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setSubmitError(data.error || "Unable to create custom order right now.");
        return;
      }

      window.location.href = data.redirectTo || "/admin";
    } catch {
      setSubmitError("Unable to create custom order right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1.5fr_0.9fr]">
      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 1
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Order details</h2>
          <p className="mt-3 text-white/65">
            Enter a clear title / summary so the admin dashboard and invoice can display this order properly.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div>
            <label className="label-rk">Order Title / Summary</label>
            <input
              className="input-rk"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Workshop labour + diagnostics + dyno session"
              required
            />
          </div>

          <div>
            <label className="label-rk">Internal Remarks (optional)</label>
            <textarea
              className="input-rk min-h-[120px]"
              value={internalRemarks}
              onChange={(e) => setInternalRemarks(e.target.value)}
              placeholder="Internal admin note. This does not need to appear on the customer-facing invoice."
            />
          </div>
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 2
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Line items</h2>
          <p className="mt-3 text-white/65">
            Add one or more billing rows. Each total is calculated automatically from quantity × unit price.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {rows.map((row, index) => {
            const normalizedRow = normalizedRows.find((item) => item.id === row.id);
            const lineTotal = normalizedRow?.lineTotal || 0;

            return (
              <div
                key={row.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
                    Item {index + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1.7fr_0.6fr_0.8fr_0.9fr]">
                  <div>
                    <label className="label-rk">Description</label>
                    <input
                      className="input-rk"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, "description", e.target.value)}
                      placeholder="e.g. Dyno tuning session"
                    />
                  </div>

                  <div>
                    <label className="label-rk">Qty</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="input-rk"
                      value={row.qty}
                      onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="label-rk">Unit Price (RM)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="input-rk"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(row.id, "unitPrice", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="label-rk">Total</label>
                    <div className="input-rk flex items-center text-white/85">
                      {formatCurrency(lineTotal)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 transition hover:bg-amber-500/15"
          >
            + Add Row
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Order Summary
          </p>

          <div className="mt-6 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 text-white/75">
              <span>Subtotal</span>
              <span className="font-semibold text-white">{formatCurrency(subtotal)}</span>
            </div>

            <div>
              <label className="label-rk">Discount (RM)</label>
              <input
                type="number"
                min="0"
                step="1"
                className="input-rk"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-base">
              <span className="font-semibold text-white">Grand Total</span>
              <span className="text-xl font-bold text-amber-200">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>

          {submitError ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">
                Create Order Failed
              </div>
              <p className="mt-2 leading-6">{submitError}</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={disableSubmit}
            className="mt-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-medium text-amber-200 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating Custom Order..." : "Create Custom Order"}
          </button>

          <p className="mt-4 text-xs leading-6 text-white/45">
            Discount uses fixed RM amount only. Grand total will never go below RM0.
          </p>
        </div>
      </div>
    </form>
  );
}
