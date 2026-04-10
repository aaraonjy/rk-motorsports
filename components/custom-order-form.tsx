"use client";

import { useMemo, useState } from "react";

type PaymentHistoryItem = {
  id: string;
  paymentDate: string;
  paymentMode: string;
  amount: number;
};

type CustomOrderInitialData = {
  orderId: string;
  customTitle: string | null;
  vehicleNo?: string | null;
  internalRemarks: string | null;
  customDiscount: number | null;
  totalPaid?: number | null;
  outstandingBalance?: number | null;
  payments?: PaymentHistoryItem[];
  existingSupportingFiles?: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    mimeType?: string | null;
  }>;
  items: Array<{
    id: string;
    description: string;
    qty: number;
    unitPrice: number;
    uom?: string | null;
  }>;
};

type CustomOrderFormProps = {
  customerId: string;
  orderId?: string;
  initialData?: CustomOrderInitialData;
  submitLabel?: string;
  submittingLabel?: string;
  errorTitle?: string;
};

type CustomLineItem = {
  id: string;
  description: string;
  qty: string;
  uom: string;
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
    uom: "",
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

function getPaymentModeLabel(value: string) {
  switch (value) {
    case "CASH":
      return "Cash";
    case "CARD":
      return "Card Payment";
    case "BANK_TRANSFER":
      return "Bank Transfer";
    case "QR":
      return "QR Payment";
    default:
      return value || "-";
  }
}

export function CustomOrderForm({
  customerId,
  orderId,
  initialData,
  submitLabel = "Create Custom Order",
  submittingLabel,
  errorTitle = "Create Order Failed",
}: CustomOrderFormProps) {
  const isEditMode = !!orderId;
  const existingTotalPaid = Number(initialData?.totalPaid ?? 0);
  const [title, setTitle] = useState(initialData?.customTitle || "");
  const [vehicleNo, setVehicleNo] = useState(initialData?.vehicleNo || "");
  const [internalRemarks, setInternalRemarks] = useState(initialData?.internalRemarks || "");
  const [discount, setDiscount] = useState(String(initialData?.customDiscount ?? 0));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [rows, setRows] = useState<CustomLineItem[]>(
    initialData?.items?.length
      ? initialData.items.map((item) => ({
          id: item.id || crypto.randomUUID(),
          description: item.description,
          qty: String(item.qty),
          uom: item.uom || "",
          unitPrice: String(item.unitPrice),
        }))
      : [createEmptyRow()]
  );
  const [submitError, setSubmitError] = useState("");
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
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
  const normalizedPaymentAmount = useMemo(
    () => Math.max(0, parseWholeNumber(paymentAmount || "0")),
    [paymentAmount]
  );
  const maxNewPayment = Math.max(grandTotal - existingTotalPaid, 0);
  const projectedPaymentAmount = Math.min(normalizedPaymentAmount, maxNewPayment);
  const projectedTotalPaid = existingTotalPaid + projectedPaymentAmount;
  const projectedOutstandingBalance = Math.max(grandTotal - projectedTotalPaid, 0);

  const hasAtLeastOneValidRow = normalizedRows.some(
    (row) => row.description.trim() && row.qty > 0 && row.unitPrice >= 0
  );

  const disableSubmit =
    isSubmitting || !title.trim() || !hasAtLeastOneValidRow || subtotal <= 0;

  function updateRow(
    rowId: string,
    field: keyof Pick<CustomLineItem, "description" | "qty" | "uom" | "unitPrice">,
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

  function handleSupportingFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) return;

    const combinedFiles = [...supportingFiles, ...selectedFiles];

    if (combinedFiles.length > 5) {
      setSubmitError("Maximum 5 supporting files are allowed.");
      event.target.value = "";
      return;
    }

    const totalSize = combinedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 25 * 1024 * 1024) {
      setSubmitError("Total supporting file size must not exceed 25MB.");
      event.target.value = "";
      return;
    }

    setSubmitError("");
    setSupportingFiles(combinedFiles);
    event.target.value = "";
  }

  function removeSupportingFile(indexToRemove: number) {
    setSupportingFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    setSubmitError("");
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
        uom: row.uom.trim() || null,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
      }));

    if (items.length === 0) {
      setSubmitError("Please add at least one valid line item.");
      return;
    }

    if (grandTotal < existingTotalPaid) {
      setSubmitError("Grand total cannot be lower than the total paid amount.");
      return;
    }

    if (projectedPaymentAmount > maxNewPayment) {
      setSubmitError("Payment amount cannot exceed the outstanding balance.");
      return;
    }

    if (supportingFiles.length > 5) {
      setSubmitError("Maximum 5 supporting files are allowed.");
      return;
    }

    const supportingFilesTotalSize = supportingFiles.reduce((sum, file) => sum + file.size, 0);
    if (supportingFilesTotalSize > 25 * 1024 * 1024) {
      setSubmitError("Total supporting file size must not exceed 25MB.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("orderType", "CUSTOM_ORDER");
      formData.append("customerId", customerId);
      formData.append("customTitle", title.trim());
      formData.append("vehicleNo", vehicleNo.trim());
      formData.append("internalRemarks", internalRemarks.trim());
      formData.append("customSubtotal", String(subtotal));
      formData.append("customDiscount", String(discountAmount));
      formData.append("customGrandTotal", String(grandTotal));
      formData.append("paymentDate", paymentDate);
      formData.append("paymentMode", paymentMode);
      formData.append("paymentAmount", String(projectedPaymentAmount));
      formData.append("items", JSON.stringify(items));

      supportingFiles.forEach((file) => {
        formData.append("supportingFiles", file);
      });

      const response = await fetch(
        isEditMode ? `/api/admin/orders/${orderId}` : "/api/admin/orders",
        {
          method: isEditMode ? "PUT" : "POST",
          body: formData,
        }
      );

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setSubmitError(
          data.error ||
            (isEditMode
              ? "Unable to update custom order right now."
              : "Unable to create custom order right now.")
        );
        return;
      }

      window.location.href = data.redirectTo || "/admin";
    } catch {
      setSubmitError(
        isEditMode
          ? "Unable to update custom order right now."
          : "Unable to create custom order right now."
      );
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
            Enter a clear description so the admin dashboard and invoice can display this order properly.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div>
            <label className="label-rk">Description</label>
            <input
              className="input-rk"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Workshop labour + diagnostics + dyno session"
              required
            />
          </div>

          <div>
            <label className="label-rk">Vehicle No. (optional)</label>
            <input
              className="input-rk"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="e.g. VXX1234"
            />
            <p className="mt-2 text-xs text-white/45">
              Used for workshop reference, invoice display, and admin search.
            </p>
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

          <div>
            <label className="label-rk">Supporting Documents (optional)</label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleSupportingFilesChange}
              className="input-rk file:mr-4 file:rounded-lg file:border-0 file:bg-amber-500/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-amber-200"
            />
            <p className="mt-2 text-xs text-white/45">
              Upload up to 5 image/video files, with a total combined size of 25MB.
            </p>

            {supportingFiles.length ? (
              <div className="mt-4 space-y-2">
                {supportingFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{file.name}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSupportingFile(index)}
                      className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {initialData?.existingSupportingFiles?.length ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  Existing Supporting Documents
                </div>
                <div className="mt-3 space-y-2">
                  {initialData.existingSupportingFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{file.fileName}</div>
                        <div className="mt-1 text-xs text-white/45">Already uploaded</div>
                      </div>
                      <a
                        href={`/api/admin/orders/${orderId}/files/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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

                <div className="mt-4 grid gap-4 md:grid-cols-[1.7fr_0.55fr_0.7fr_0.8fr_0.9fr]">
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
                    <label className="label-rk">UOM</label>
                    <input
                      className="input-rk"
                      value={row.uom}
                      onChange={(e) => updateRow(row.id, "uom", e.target.value)}
                      placeholder="e.g. pcs"
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

          <div className="mt-8 border-t border-white/10 pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Payment Details
            </p>
            <p className="mt-3 text-sm text-white/60">
              Record payment on the same form before submitting the order. Leave amount as RM0 if no payment is received yet.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="label-rk">Payment Date</label>
                <input
                  type="date"
                  className="input-rk"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label-rk">Payment Mode</label>
                <div className="relative">
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="input-rk appearance-none pr-12"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card Payment</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="QR">QR Payment</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
                </div>
              </div>

              <div>
                <label className="label-rk">Payment Amount (RM)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  max={maxNewPayment}
                  className="input-rk"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                />
                <p className="mt-2 text-xs text-white/45">
                  Maximum payable now: {formatCurrency(maxNewPayment)}
                </p>
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75 sm:grid-cols-3">
                <div>
                  <div className="text-white/45">Current Paid</div>
                  <div className="mt-1 font-semibold text-white">{formatCurrency(existingTotalPaid)}</div>
                </div>
                <div>
                  <div className="text-white/45">After Submit</div>
                  <div className="mt-1 font-semibold text-white">{formatCurrency(projectedTotalPaid)}</div>
                </div>
                <div>
                  <div className="text-white/45">Outstanding</div>
                  <div className="mt-1 font-semibold text-amber-200">{formatCurrency(projectedOutstandingBalance)}</div>
                </div>
              </div>

              {initialData?.payments?.length ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    Payment History
                  </div>
                  <div className="mt-3 space-y-2">
                    {initialData.payments.map((payment) => (
                      <div key={payment.id} className="rounded-xl border border-white/8 bg-black/20 p-3 text-sm text-white/80">
                        <div className="font-medium text-white">
                          {formatCurrency(payment.amount)} • {getPaymentModeLabel(payment.paymentMode)}
                        </div>
                        <div className="mt-1 text-xs text-white/45">{payment.paymentDate}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {submitError ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">
                {errorTitle}
              </div>
              <p className="mt-2 leading-6">{submitError}</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={disableSubmit}
            className="mt-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-medium text-amber-200 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? submittingLabel || (isEditMode ? "Updating Custom Order..." : "Creating Custom Order...")
              : submitLabel}
          </button>

          <p className="mt-4 text-xs leading-6 text-white/45">
            Discount uses fixed RM amount only. Grand total will never go below RM0.
          </p>
        </div>
      </div>
    </form>
  );
}
