"use client";

import { useMemo, useState } from "react";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  getTaxDisplayLabel,
  normalizeTaxCalculationMode,
  type TaxCalculationMethodValue,
  type TaxCalculationModeValue,
} from "@/lib/tax";

type PaymentHistoryItem = {
  id: string;
  paymentDate: string;
  paymentMode: string;
  amount: number;
};

type CustomOrderInitialData = {
  orderId: string;
  customTitle: string | null;
  documentDate?: string | null;
  vehicleNo?: string | null;
  internalRemarks: string | null;
  customDiscount: number | null;
  taxCodeId?: string | null;
  taxCode?: string | null;
  taxDescription?: string | null;
  taxRate?: number | null;
  taxCalculationMethod?: TaxCalculationMethodValue | null;
  taxAmount?: number | null;
  taxableSubtotal?: number | null;
  grandTotalAfterTax?: number | null;
  isTaxEnabledSnapshot?: boolean | null;
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
    inventoryProductId?: string | null;
    productCodeSnapshot?: string | null;
    itemTypeSnapshot?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
    description: string;
    qty: number;
    unitPrice: number;
    uom?: string | null;
    taxCodeId?: string | null;
    taxCode?: string | null;
    taxRate?: number | null;
    taxAmount?: number | null;
  }>;
};

type TaxCodeOption = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: TaxCalculationMethodValue;
};

type ProductOption = {
  id: string;
  code: string;
  description: string;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  baseUom: string;
  sellingPrice: number;
  isActive: boolean;
};

type CustomOrderFormProps = {
  customerId: string;
  orderId?: string;
  initialData?: CustomOrderInitialData;
  submitLabel?: string;
  submittingLabel?: string;
  errorTitle?: string;
  productOptions?: ProductOption[];
  taxConfig?: {
    taxModuleEnabled: boolean;
    taxCalculationMode: TaxCalculationModeValue;
    defaultAdminTaxCodeId?: string | null;
    taxCodes: TaxCodeOption[];
  };
};

type CustomLineItem = {
  id: string;
  inventoryProductId: string;
  productCodeSnapshot: string;
  itemTypeSnapshot: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | "";
  description: string;
  qty: string;
  uom: string;
  unitPrice: string;
  taxCodeId: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

function createEmptyRow(defaultTaxCodeId = ""): CustomLineItem {
  return {
    id: crypto.randomUUID(),
    inventoryProductId: "",
    productCodeSnapshot: "",
    itemTypeSnapshot: "",
    description: "",
    qty: "1",
    uom: "",
    unitPrice: "0.00",
    taxCodeId: defaultTaxCodeId,
  };
}

function getItemTypeLabel(value: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | "") {
  switch (value) {
    case "STOCK_ITEM":
      return "Stock Item";
    case "SERVICE_ITEM":
      return "Service Item";
    case "NON_STOCK_ITEM":
      return "Non-Stock Item";
    default:
      return "-";
  }
}

function parseWholeNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseMoneyAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return roundMoney(parsed);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function hasSpacing(value: string) {
  return /\s/.test(value);
}

function removeSpacing(value: string) {
  return value.replace(/\s+/g, "");
}

function formatTaxOptionLabel(taxCode: TaxCodeOption) {
  return getTaxDisplayLabel({
    code: taxCode.code,
    description: taxCode.description,
    rate: taxCode.rate,
  });
}

export function CustomOrderForm({
  customerId,
  orderId,
  initialData,
  submitLabel = "Create Custom Order",
  submittingLabel,
  errorTitle = "Create Order Failed",
  productOptions = [],
  taxConfig,
}: CustomOrderFormProps) {
  const isEditMode = !!orderId;
  const existingTotalPaid = Number(initialData?.totalPaid ?? 0);
  const [title, setTitle] = useState(initialData?.customTitle || "");
  const [documentDate, setDocumentDate] = useState(
    initialData?.documentDate || new Date().toISOString().slice(0, 10)
  );
  const [vehicleNo, setVehicleNo] = useState(initialData?.vehicleNo || "");
  const [vehicleNoError, setVehicleNoError] = useState("");
  const [internalRemarks, setInternalRemarks] = useState(initialData?.internalRemarks || "");
  const [discount, setDiscount] = useState(String(initialData?.customDiscount ?? 0));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const taxCalculationMode = normalizeTaxCalculationMode(taxConfig?.taxCalculationMode);
  const isLineItemTaxMode = Boolean(taxConfig?.taxModuleEnabled && taxCalculationMode === "LINE_ITEM");
  const [rows, setRows] = useState<CustomLineItem[]>(() => {
    const defaultLineItemTaxCodeId = initialData?.taxCodeId || taxConfig?.defaultAdminTaxCodeId || "";

    if (initialData?.items?.length) {
      return initialData.items.map((item) => ({
        id: item.id || crypto.randomUUID(),
        inventoryProductId: item.inventoryProductId || "",
        productCodeSnapshot: item.productCodeSnapshot || "",
        itemTypeSnapshot: item.itemTypeSnapshot || "",
        description: item.description,
        qty: String(item.qty),
        uom: item.uom || "",
        unitPrice: String(Number(item.unitPrice).toFixed(2)),
        taxCodeId: item.taxCodeId || defaultLineItemTaxCodeId,
      }));
    }

    return [createEmptyRow(defaultLineItemTaxCodeId)];
  });
  const [productPickerRowId, setProductPickerRowId] = useState<string | null>(null);
  const [productKeyword, setProductKeyword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableTaxCodes = useMemo(() => {
    const current = taxConfig?.taxCodes || [];

    if (
      initialData?.taxCodeId &&
      !current.some((item) => item.id === initialData.taxCodeId) &&
      initialData.taxCode &&
      initialData.taxRate != null &&
      initialData.taxCalculationMethod
    ) {
      return [
        ...current,
        {
          id: initialData.taxCodeId,
          code: initialData.taxCode,
          description: initialData.taxDescription || initialData.taxCode,
          rate: Number(initialData.taxRate || 0),
          calculationMethod: initialData.taxCalculationMethod,
        },
      ];
    }

    return current;
  }, [initialData, taxConfig?.taxCodes]);

  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState(() => {
    if (initialData?.taxCodeId) return initialData.taxCodeId;
    if (!taxConfig?.taxModuleEnabled) return "";
    return taxConfig?.defaultAdminTaxCodeId || "";
  });

  const normalizedRows = useMemo(
    () =>
      rows.map((row) => {
        const qty = Math.max(1, parseWholeNumber(row.qty || "0"));
        const unitPrice = Math.max(0, parseMoneyAmount(row.unitPrice || "0"));
        const lineTotal = roundMoney(qty * unitPrice);
        const lineTaxCode = availableTaxCodes.find((item) => item.id === row.taxCodeId) || null;
        const lineTaxBreakdown = calculateLineItemTaxBreakdown({
          lineTotal,
          taxRate: lineTaxCode?.rate ?? null,
          calculationMethod: lineTaxCode?.calculationMethod ?? null,
          taxEnabled: Boolean(isLineItemTaxMode && lineTaxCode),
        });

        return {
          ...row,
          inventoryProductId: row.inventoryProductId,
          productCodeSnapshot: row.productCodeSnapshot,
          itemTypeSnapshot: row.itemTypeSnapshot,
          qty,
          unitPrice,
          lineTotal,
          lineTaxCode,
          lineTaxAmount: lineTaxBreakdown.taxAmount,
          lineGrandTotalAfterTax: lineTaxBreakdown.lineGrandTotalAfterTax,
        };
      }),
    [rows, availableTaxCodes, isLineItemTaxMode]
  );

  const subtotal = useMemo(
    () => roundMoney(normalizedRows.reduce((sum, row) => sum + row.lineTotal, 0)),
    [normalizedRows]
  );

  const discountAmount = useMemo(
    () => Math.max(0, parseMoneyAmount(discount || "0")),
    [discount]
  );

  const selectedTaxCode = useMemo(
    () => availableTaxCodes.find((item) => item.id === selectedTaxCodeId) || null,
    [availableTaxCodes, selectedTaxCodeId]
  );

  const transactionTaxBreakdown = useMemo(
    () =>
      calculateTaxBreakdown({
        subtotal,
        discount: discountAmount,
        taxRate: selectedTaxCode?.rate ?? null,
        calculationMethod: selectedTaxCode?.calculationMethod ?? null,
        taxEnabled: Boolean(taxConfig?.taxModuleEnabled && !isLineItemTaxMode && selectedTaxCode),
      }),
    [discountAmount, selectedTaxCode, subtotal, taxConfig?.taxModuleEnabled, isLineItemTaxMode]
  );

  const lineItemTaxAmount = useMemo(
    () => roundMoney(normalizedRows.reduce((sum, row) => sum + row.lineTaxAmount, 0)),
    [normalizedRows]
  );

  const discountedSubtotal = useMemo(
    () => Math.max(0, roundMoney(subtotal - discountAmount)),
    [subtotal, discountAmount]
  );

  const taxAmount = isLineItemTaxMode ? lineItemTaxAmount : transactionTaxBreakdown.taxAmount;
  const grandTotal = isLineItemTaxMode
    ? roundMoney(discountedSubtotal + lineItemTaxAmount)
    : transactionTaxBreakdown.grandTotalAfterTax;
  const normalizedPaymentAmount = useMemo(
    () => Math.max(0, parseMoneyAmount(paymentAmount || "0")),
    [paymentAmount]
  );
  const maxNewPayment = roundMoney(Math.max(grandTotal - existingTotalPaid, 0));
  const projectedPaymentAmount = Math.min(normalizedPaymentAmount, maxNewPayment);
  const projectedTotalPaid = roundMoney(existingTotalPaid + projectedPaymentAmount);
  const projectedOutstandingBalance = roundMoney(Math.max(grandTotal - projectedTotalPaid, 0));

  const hasAtLeastOneValidRow = normalizedRows.some(
    (row) => row.description.trim() && row.qty > 0 && row.unitPrice >= 0
  );

  const disableSubmit =
    isSubmitting || !title.trim() || !hasAtLeastOneValidRow || subtotal <= 0;

  function updateRow(
    rowId: string,
    field: keyof Pick<CustomLineItem, "inventoryProductId" | "productCodeSnapshot" | "itemTypeSnapshot" | "description" | "qty" | "uom" | "unitPrice" | "taxCodeId">,
    value: string
  ) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  }

  function applyProductToRow(rowId: string, product: ProductOption) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              inventoryProductId: product.id,
              productCodeSnapshot: product.code,
              itemTypeSnapshot: product.itemType,
              description: product.description,
              uom: product.baseUom,
              unitPrice: Number(product.sellingPrice || 0).toFixed(2),
            }
          : row
      )
    );
    setProductPickerRowId(null);
    setProductKeyword("");
  }

  function clearProductFromRow(rowId: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              inventoryProductId: "",
              productCodeSnapshot: "",
              itemTypeSnapshot: "",
            }
          : row
      )
    );
  }

  const filteredProductOptions = useMemo(() => {
    const keyword = productKeyword.trim().toLowerCase();
    return productOptions.filter((product) => {
      if (!product.isActive) return false;
      if (!keyword) return true;
      return (
        product.code.toLowerCase().includes(keyword) ||
        product.description.toLowerCase().includes(keyword)
      );
    });
  }, [productKeyword, productOptions]);

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow(isLineItemTaxMode ? taxConfig?.defaultAdminTaxCodeId || "" : "")]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => {
      if (prev.length === 1) {
        return [createEmptyRow(isLineItemTaxMode ? taxConfig?.defaultAdminTaxCodeId || "" : "")];
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

    if (hasSpacing(vehicleNo)) {
      setVehicleNoError("No spacing is allowed in Vehicle No.");
      return;
    }

    if (disableSubmit) return;

    const items = normalizedRows
      .filter((row) => row.description.trim())
      .map((row) => ({
        inventoryProductId: row.inventoryProductId || null,
        productCodeSnapshot: row.productCodeSnapshot || null,
        itemTypeSnapshot: row.itemTypeSnapshot || null,
        description: row.description.trim(),
        qty: row.qty,
        uom: row.uom.trim() || null,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        taxCodeId: isLineItemTaxMode ? row.lineTaxCode?.id || null : null,
        taxCode: isLineItemTaxMode ? row.lineTaxCode?.code || null : null,
        taxRate: isLineItemTaxMode ? row.lineTaxCode?.rate ?? 0 : 0,
        taxAmount: isLineItemTaxMode ? row.lineTaxAmount : 0,
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
      formData.append("documentDate", documentDate);
      formData.append("vehicleNo", vehicleNo.trim());
      formData.append("internalRemarks", internalRemarks.trim());
      formData.append("customSubtotal", String(subtotal));
      formData.append("customDiscount", String(discountAmount));
      formData.append("customGrandTotal", String(grandTotal));
      formData.append("taxCodeId", isLineItemTaxMode ? "" : selectedTaxCodeId || "");
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
    <form onSubmit={handleSubmit} className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)]">
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
            <label className="label-rk">Document Date</label>
            <input
              type="date"
              className="input-rk"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              disabled={isEditMode}
            />
            <p className="mt-2 text-xs text-white/45">
              {isEditMode
                ? "Document Date is locked after creation to preserve the assigned document number."
                : "Defaults to today. You may choose an earlier date to record a backdated transaction."}
            </p>
          </div>

          <div>
            <label className="label-rk">Vehicle No. (optional)</label>
            <input
              className="input-rk"
              value={vehicleNo}
              onChange={(e) => {
                const nextValue = e.target.value.toUpperCase();
                const hadSpacing = hasSpacing(nextValue);
                setVehicleNo(removeSpacing(nextValue));
                setVehicleNoError(hadSpacing ? "No spacing is allowed in Vehicle No." : "");
              }}
              onPaste={(e) => {
                const pastedValue = e.clipboardData.getData("text");
                if (hasSpacing(pastedValue)) {
                  setVehicleNoError("No spacing is allowed in Vehicle No.");
                }
              }}
              placeholder="e.g. VXX1234"
            />
            {vehicleNoError ? (
              <p className="mt-2 text-xs text-red-300">{vehicleNoError}</p>
            ) : (
              <p className="mt-2 text-xs text-white/45">
                Used for workshop reference, invoice display, and admin search.
              </p>
            )}
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
            const lineTaxAmount = normalizedRow?.lineTaxAmount || 0;

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

                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(240px,1.1fr)_minmax(0,1.4fr)]">
                    <div>
                      <label className="label-rk">Product Code</label>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className={`text-sm ${row.productCodeSnapshot ? "font-semibold text-white" : "text-white/45"}`}>
                          {row.productCodeSnapshot || ""}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setProductPickerRowId(row.id);
                              setProductKeyword("");
                            }}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                          >
                            Select Product
                          </button>
                          {row.inventoryProductId ? (
                            <button
                              type="button"
                              onClick={() => clearProductFromRow(row.id)}
                              className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="label-rk">Description</label>
                      <div className="flex min-h-[96px] items-center">
                        <input
                          className="input-rk"
                          value={row.description}
                          onChange={(e) => updateRow(row.id, "description", e.target.value)}
                          placeholder="e.g. Dyno tuning session"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                        step="0.01"
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

                {row.inventoryProductId ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/65">
                    <span className="font-semibold text-white/80">Linked Product</span>
                    <span>{row.productCodeSnapshot}</span>
                    <span>•</span>
                    <span>{getItemTypeLabel(row.itemTypeSnapshot)}</span>
                  </div>
                ) : null}

                {isLineItemTaxMode ? (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                      Tax Details
                    </div>
                    <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
                      <div>
                        <label className="label-rk">Tax Code</label>
                        <div className="relative">
                          <select
                            value={row.taxCodeId}
                            onChange={(e) => updateRow(row.id, "taxCodeId", e.target.value)}
                            className="input-rk appearance-none pr-12"
                          >
                            <option value="">No Tax</option>
                            {availableTaxCodes.map((item) => (
                              <option key={item.id} value={item.id}>
                                {formatTaxOptionLabel(item)}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
                        </div>
                      </div>

                      <div>
                        <label className="label-rk">Tax Amount</label>
                        <div className="input-rk flex items-center text-white/85">
                          {formatCurrency(lineTaxAmount)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
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
                step="0.01"
                className="input-rk"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {taxConfig?.taxModuleEnabled && !isLineItemTaxMode ? (
              <div>
                <label className="label-rk">Tax Code</label>
                <div className="relative">
                  <select
                    value={selectedTaxCodeId}
                    onChange={(e) => setSelectedTaxCodeId(e.target.value)}
                    className="input-rk appearance-none pr-12"
                  >
                    <option value="">No Tax</option>
                    {availableTaxCodes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatTaxOptionLabel(item)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">▾</div>
                </div>
                <p className="mt-2 text-xs text-white/45">
                  Default admin tax code is pre-selected, but you may change or remove it for this order.
                </p>
              </div>
            ) : null}

            {taxConfig?.taxModuleEnabled && isLineItemTaxMode ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/60">
                Tax Code is now controlled inside each line item. Order Summary shows the combined tax amount from all rows.
              </div>
            ) : null}

            {taxConfig?.taxModuleEnabled ? (
              <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-white/75">
                <span>Tax Amount</span>
                <span className="font-semibold text-white">{formatCurrency(taxAmount)}</span>
              </div>
            ) : null}

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
              Record payment on the same form before submitting the order. Leave amount as RM0.00 if no payment is received yet.
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
                  step="0.01"
                  max={maxNewPayment}
                  className="input-rk"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
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
                          {formatCurrency(Number(payment.amount ?? 0))} • {getPaymentModeLabel(payment.paymentMode)}
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
            Discount supports up to 2 decimal places. Grand total will never go below RM0.00.
            {taxConfig?.taxModuleEnabled
              ? isLineItemTaxMode
                ? " In Line Item mode, each row controls its own tax code and the summary shows the combined tax total."
                : " When a tax code is selected, payment and outstanding balance use the total after tax."
              : ""}
          </p>
        </div>
      </div>

      {productPickerRowId ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0f] shadow-2xl">
            <div className="border-b border-white/10 p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">Product Picker</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">Select Product</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProductPickerRowId(null);
                    setProductKeyword("");
                  }}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              <input
                className="input-rk mt-5"
                value={productKeyword}
                onChange={(e) => setProductKeyword(e.target.value)}
                placeholder="Search by product code or description"
              />
            </div>

            <div className="max-h-[64vh] overflow-y-auto p-6 md:p-8">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead>
                    <tr className="text-left text-white/45">
                      <th className="px-3 py-3 font-medium">Code</th>
                      <th className="px-3 py-3 font-medium">Description</th>
                      <th className="px-3 py-3 font-medium">Type</th>
                      <th className="px-3 py-3 font-medium">UOM</th>
                      <th className="px-3 py-3 font-medium">Price</th>
                      <th className="px-3 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredProductOptions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-white/50">No active product found.</td>
                      </tr>
                    ) : filteredProductOptions.map((product) => (
                      <tr key={product.id} className="align-top text-white/80">
                        <td className="px-3 py-4 font-semibold text-white">{product.code}</td>
                        <td className="px-3 py-4">{product.description}</td>
                        <td className="px-3 py-4">{getItemTypeLabel(product.itemType)}</td>
                        <td className="px-3 py-4">{product.baseUom}</td>
                        <td className="px-3 py-4">{formatCurrency(product.sellingPrice)}</td>
                        <td className="px-3 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => applyProductToRow(productPickerRowId, product)}
                            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/15"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </form>
  );
}
