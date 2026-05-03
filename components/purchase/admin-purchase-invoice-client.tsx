"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  normalizeTaxCalculationMode,
  roundMoney,
  type TaxCalculationMethodValue,
  type TaxCalculationModeValue,
} from "@/lib/tax";

type SupplierOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  supplierAccountNo?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingAddressLine3?: string | null;
  billingAddressLine4?: string | null;
  billingCity?: string | null;
  billingPostCode?: string | null;
  billingCountryCode?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryAddressLine3?: string | null;
  deliveryAddressLine4?: string | null;
  deliveryCity?: string | null;
  deliveryPostCode?: string | null;
  deliveryCountryCode?: string | null;
  attention?: string | null;
  currency?: string | null;
  agentId?: string | null;
};

type ProductUomConversionOption = { id?: string; uomCode: string; conversionRate: number };

type ProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  unitCost: number;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
  uomConversions?: ProductUomConversionOption[];
};

type SimpleOption = { id: string; code: string; name: string; isActive?: boolean; projectId?: string };

type TaxCodeOption = {
  id: string;
  code: string;
  description: string;
  rate: number;
  calculationMethod: TaxCalculationMethodValue;
};

type PurchaseTransactionRecord = {
  id: string;
  docNo: string;
  docType?: "PO" | "GRN" | "PI" | string | null;
  docDate: string;
  docDesc?: string | null;
  supplierId?: string | null;
  supplierName: string;
  supplierAccountNo?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingAddressLine3?: string | null;
  billingAddressLine4?: string | null;
  billingCity?: string | null;
  billingPostCode?: string | null;
  billingCountryCode?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryAddressLine3?: string | null;
  deliveryAddressLine4?: string | null;
  deliveryCity?: string | null;
  deliveryPostCode?: string | null;
  deliveryCountryCode?: string | null;
  attention?: string | null;
  contactNo?: string | null;
  email?: string | null;
  currency?: string | null;
  reference?: string | null;
  remarks?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  taxCodeId?: string | null;
  termsAndConditions?: string | null;
  bankAccount?: string | null;
  footerRemarks?: string | null;
  status: "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED" | string;
  grandTotal: string | number;
  revisedFrom?: { id: string; docNo?: string | null } | null;
  revisions?: Array<{ id: string; docNo?: string | null; status?: string | null }>;
  sourceLinks?: Array<{ targetTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
  targetLinks?: Array<{ sourceTransaction?: { id: string; docType?: string | null; docNo?: string | null; status?: string | null } | null }>;
  lines?: Array<{
    id?: string;
    inventoryProductId?: string | null;
    productCode?: string | null;
    productDescription?: string | null;
    itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
    uom?: string | null;
    qty?: string | number | null;
    remainingQty?: string | number | null;
    remainingReceiveQty?: string | number | null;
    remainingInvoiceQty?: string | number | null;
    unitCost?: string | number | null;
    discountRate?: string | number | null;
    discountType?: string | null;
    locationId?: string | null;
    batchNo?: string | null;
    taxCodeId?: string | null;
    remarks?: string | null;
  }>;
};

type StockNumberFormatConfig = { qtyDecimalPlaces: number; unitCostDecimalPlaces: number; priceDecimalPlaces: number };

type Props = {
  initialTransactions: PurchaseTransactionRecord[];
  sourceDocuments: PurchaseTransactionRecord[];
  initialSuppliers: SupplierOption[];
  initialProducts: ProductOption[];
  initialAgents: SimpleOption[];
  initialProjects: SimpleOption[];
  initialDepartments: SimpleOption[];
  initialLocations: SimpleOption[];
  defaultLocationId: string;
  projectFeatureEnabled: boolean;
  departmentFeatureEnabled: boolean;
  stockNumberFormat: StockNumberFormatConfig;
  taxConfig: {
    taxModuleEnabled: boolean;
    taxCalculationMode: TaxCalculationModeValue;
    defaultAdminTaxCodeId?: string | null;
    taxCodes: TaxCodeOption[];
  };
};

type LineForm = {
  sourceLineId: string;
  sourceTransactionId: string;
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  uom: string;
  qty: string;
  unitCost: string;
  discountRate: string;
  discountType: "PERCENT" | "AMOUNT";
  locationId: string;
  batchNo: string;
  taxCodeId: string;
  remarks: string;
};

type ActiveTab = "HEADER" | "BODY" | "FOOTER";

const DOC_TYPE = "PI";
const TITLE = "Purchase Invoice";
const SUBTITLE = "Record purchase amount. Direct PI stocks in; PI generated from GRN does not stock in again.";
const API_PATH = "/api/admin/purchase/purchase-invoice";
const DETAIL_PATH = "/admin/purchase/purchase-invoice";

function todayInput() { return new Date().toISOString().slice(0, 10); }
function money(value: unknown) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"; }
function formatDate(value: string | Date | null | undefined) { if (!value) return "-"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "-"; return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" }); }
function formatDateInput(value: string | Date | null | undefined) { if (!value) return todayInput(); const date = new Date(value); if (Number.isNaN(date.getTime())) return todayInput(); const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const year = parts.find((part) => part.type === "year")?.value; const month = parts.find((part) => part.type === "month")?.value; const day = parts.find((part) => part.type === "day")?.value; return year && month && day ? `${year}-${month}-${day}` : todayInput(); }
function getDecimalPlaces(value: unknown, fallback = 2) { const numeric = Number(value ?? fallback); if (!Number.isFinite(numeric)) return fallback; return Math.max(0, Math.min(6, Math.trunc(numeric))); }
function formatDecimalInput(value: unknown, decimalPlaces: number) { const numeric = Number(value ?? 0); if (!Number.isFinite(numeric)) return (0).toFixed(decimalPlaces); return numeric.toFixed(decimalPlaces); }
function normalizeDocNoInput(value: string) { return value.toUpperCase().replace(/\s+/g, "").slice(0, 30); }
function lineAmount(line: LineForm) { const qty = Math.max(0, Number(line.qty || 0)); const unitCost = Math.max(0, Number(line.unitCost || 0)); const subtotal = roundMoney(qty * unitCost); const discountRate = Math.max(0, Number(line.discountRate || 0)); const discount = line.discountType === "AMOUNT" ? discountRate : roundMoney(subtotal * (discountRate / 100)); return Math.max(0, roundMoney(subtotal - discount)); }
function emptyLine(defaultLocationId = "", defaultTaxCodeId = "", qtyDecimalPlaces = 2, unitCostDecimalPlaces = 2): LineForm { return { sourceLineId: "", sourceTransactionId: "", inventoryProductId: "", productCode: "", productDescription: "", itemType: "STOCK_ITEM", uom: "", qty: formatDecimalInput(1, qtyDecimalPlaces), unitCost: formatDecimalInput(0, unitCostDecimalPlaces), discountRate: "0", discountType: "PERCENT", locationId: defaultLocationId, batchNo: "", taxCodeId: defaultTaxCodeId, remarks: "" }; }
function statusClass(status: string) { if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200"; if (status === "COMPLETED") return "border-sky-500/25 bg-sky-500/10 text-sky-200"; if (status === "PARTIAL") return "border-indigo-500/25 bg-indigo-500/10 text-indigo-200"; return "border-amber-500/25 bg-amber-500/10 text-amber-200"; }
function getProductUomOptions(product: ProductOption | null | undefined) { if (!product) return []; const seen = new Set<string>(); const result: Array<{ id: string; label: string }> = []; const add = (uomCode: string, label: string) => { const normalized = String(uomCode || "").trim().toUpperCase(); if (!normalized || seen.has(normalized)) return; seen.add(normalized); result.push({ id: normalized, label }); }; add(product.baseUom, `${product.baseUom} (Base UOM)`); for (const item of product.uomConversions || []) { if (Number(item.conversionRate) > 0) add(item.uomCode, `${item.uomCode} (1 = ${item.conversionRate} ${product.baseUom})`); } return result; }

export function AdminPurchaseInvoiceClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qtyDecimalPlaces = getDecimalPlaces(props.stockNumberFormat.qtyDecimalPlaces, 2);
  const unitCostDecimalPlaces = getDecimalPlaces(props.stockNumberFormat.unitCostDecimalPlaces, 2);
  const taxMode = normalizeTaxCalculationMode(props.taxConfig.taxCalculationMode);
  const defaultTaxCodeId = taxMode === "LINE_ITEM" ? props.taxConfig.defaultAdminTaxCodeId || "" : "";
  const editId = searchParams.get("edit");
  const sourceId = searchParams.get("source");
  const editingTransaction = props.initialTransactions.find((item) => item.id === editId) || null;
  const sourceTransaction = props.sourceDocuments.find((item) => item.id === sourceId) || null;
  const [activeTab, setActiveTab] = useState<ActiveTab>("HEADER");
  const [docNo, setDocNo] = useState("");
  const [manualDocNoEnabled, setManualDocNoEnabled] = useState(false);
  const [form, setForm] = useState({
    docDate: todayInput(), docDesc: TITLE, supplierId: "", supplierName: "", supplierAccountNo: "", contactNo: "", email: "", currency: "MYR", reference: "", remarks: "", attention: "", agentId: "", projectId: "", departmentId: "", taxCodeId: "", termsAndConditions: "", bankAccount: "", footerRemarks: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine(props.defaultLocationId, defaultTaxCodeId, qtyDecimalPlaces, unitCostDecimalPlaces)]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(Boolean(editId || sourceId));

  useEffect(() => {
    const source = editingTransaction || sourceTransaction;
    if (!source) return;
    setDocNo(editingTransaction?.docNo || "");
    setManualDocNoEnabled(false);
    setForm({
      docDate: editingTransaction ? formatDateInput(source.docDate) : todayInput(),
      docDesc: source.docDesc || TITLE,
      supplierId: source.supplierId || "",
      supplierName: source.supplierName || "",
      supplierAccountNo: source.supplierAccountNo || "",
      contactNo: source.contactNo || "",
      email: source.email || "",
      currency: source.currency || "MYR",
      reference: editingTransaction ? source.reference || "" : source.docNo || "",
      remarks: source.remarks || "",
      attention: source.attention || "",
      agentId: source.agentId || "",
      projectId: source.projectId || "",
      departmentId: source.departmentId || "",
      taxCodeId: source.taxCodeId || "",
      termsAndConditions: source.termsAndConditions || "",
      bankAccount: source.bankAccount || "",
      footerRemarks: source.footerRemarks || "",
    });
    setLines((source.lines || []).map((line) => ({
      sourceLineId: editingTransaction ? "" : line.id || "",
      sourceTransactionId: editingTransaction ? "" : source.id,
      inventoryProductId: line.inventoryProductId || "",
      productCode: line.productCode || "",
      productDescription: line.productDescription || "",
      itemType: line.itemType || "STOCK_ITEM",
      uom: line.uom || "",
      qty: formatDecimalInput((line as any).remainingQty ?? (line as any).remainingInvoiceQty ?? (line as any).remainingReceiveQty ?? line.qty ?? 1, qtyDecimalPlaces),
      unitCost: formatDecimalInput(line.unitCost ?? 0, unitCostDecimalPlaces),
      discountRate: formatDecimalInput(line.discountRate ?? 0, 2),
      discountType: line.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
      locationId: line.locationId || props.defaultLocationId,
      batchNo: line.batchNo || "",
      taxCodeId: line.taxCodeId || defaultTaxCodeId,
      remarks: line.remarks || "",
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, sourceId]);


  useEffect(() => {
    if (editId || sourceId) {
      setIsCreateOpen(true);
    }
  }, [editId, sourceId]);

  const headerTaxCode = props.taxConfig.taxCodes.find((item) => item.id === form.taxCodeId) || null;
  const totals = useMemo(() => {
    const mapped = lines.map((line) => {
      const subtotal = roundMoney(Number(line.qty || 0) * Number(line.unitCost || 0));
      const discountRate = Number(line.discountRate || 0);
      const discount = line.discountType === "AMOUNT" ? discountRate : roundMoney(subtotal * (discountRate / 100));
      const total = Math.max(0, roundMoney(subtotal - discount));
      const lineTaxCode = props.taxConfig.taxCodes.find((item) => item.id === line.taxCodeId) || (taxMode === "LINE_ITEM" ? props.taxConfig.taxCodes.find((item) => item.id === props.taxConfig.defaultAdminTaxCodeId) : null);
      const tax = calculateLineItemTaxBreakdown({ lineTotal: total, taxRate: lineTaxCode?.rate || 0, calculationMethod: lineTaxCode?.calculationMethod || null, taxEnabled: props.taxConfig.taxModuleEnabled && Boolean(lineTaxCode) });
      return { subtotal, discount, tax: tax.taxAmount, total: tax.lineGrandTotalAfterTax };
    });
    const subtotal = roundMoney(mapped.reduce((sum, item) => sum + item.subtotal, 0));
    const discount = roundMoney(mapped.reduce((sum, item) => sum + item.discount, 0));
    if (taxMode === "LINE_ITEM") return { subtotal, discount, tax: roundMoney(mapped.reduce((sum, item) => sum + item.tax, 0)), grandTotal: roundMoney(mapped.reduce((sum, item) => sum + item.total, 0)) };
    const tax = calculateTaxBreakdown({ subtotal, discount, taxRate: headerTaxCode?.rate || 0, calculationMethod: headerTaxCode?.calculationMethod || null, taxEnabled: props.taxConfig.taxModuleEnabled && Boolean(headerTaxCode) });
    return { subtotal, discount, tax: tax.taxAmount, grandTotal: tax.grandTotalAfterTax };
  }, [lines, props.taxConfig, taxMode, headerTaxCode]);

  function applySupplier(supplierId: string) {
    const supplier = props.initialSuppliers.find((item) => item.id === supplierId);
    setForm((prev) => ({ ...prev, supplierId, supplierName: supplier?.name || "", supplierAccountNo: supplier?.supplierAccountNo || "", contactNo: supplier?.phone || "", email: supplier?.email || "", currency: supplier?.currency || "MYR", agentId: supplier?.agentId || "" }));
  }
  function applyProduct(index: number, productId: string) {
    const product = props.initialProducts.find((item) => item.id === productId);
    setLines((prev) => prev.map((line, lineIndex) => lineIndex === index ? { ...line, inventoryProductId: productId, productCode: product?.code || "", productDescription: product?.description || "", itemType: product?.itemType || "STOCK_ITEM", uom: product?.baseUom || "", unitCost: formatDecimalInput(product?.unitCost || 0, unitCostDecimalPlaces), locationId: line.locationId || props.defaultLocationId } : line));
  }
  function updateLine(index: number, key: keyof LineForm, value: string) { setLines((prev) => prev.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)); }
  function addLine() { setLines((prev) => [...prev, emptyLine(props.defaultLocationId, defaultTaxCodeId, qtyDecimalPlaces, unitCostDecimalPlaces)]); }
  function removeLine(index: number) { setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, lineIndex) => lineIndex !== index)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMessage(""); setIsSubmitting(true);
    try {
      const response = await fetch(editingTransaction ? `${API_PATH}/${editingTransaction.id}` : API_PATH, {
        method: editingTransaction ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, docNo: manualDocNoEnabled ? docNo : undefined, sourceTransactionId: sourceTransaction?.id || null, sourceDocType: sourceTransaction?.docType || null, lines }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) { setError(data.error || `Unable to save ${TITLE}.`); return; }
      const savedId = data.transaction?.id || editingTransaction?.id;
      if (savedId) router.push(`${DETAIL_PATH}/${savedId}?success=${encodeURIComponent(`${TITLE} saved successfully.`)}`);
      else { setMessage(`${TITLE} saved successfully.`); router.refresh(); }
    } catch { setError(`Unable to save ${TITLE}.`); }
    finally { setIsSubmitting(false); }
  }

    const pageTitle = editingTransaction ? `Edit ${TITLE}` : `Create ${TITLE}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mt-3 text-4xl font-bold">{TITLE}</h1>
          <p className="mt-4 max-w-3xl text-white/70">{SUBTITLE}</p>
        </div>
      </div>

      {message && !isCreateOpen ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
      ) : null}

      {error && !isCreateOpen ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">{TITLE}</p>
            <h2 className="mt-4 text-2xl font-bold">Existing {TITLE} Records</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">Manage {TITLE.toLowerCase()} transaction records.</p>
          </div>
          <button type="button" onClick={() => { setIsCreateOpen(true); setActiveTab("HEADER"); }} className="inline-flex items-center justify-center rounded-xl bg-red-500 px-5 py-3 font-semibold text-white transition hover:bg-red-400">
            Create {TITLE}
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-rk" placeholder={`Search ${TITLE.toLowerCase()} no / supplier`} readOnly />
            <select className="input-rk" defaultValue="ALL">
              <option value="ALL">All Status</option>
              <option value="OPEN">Open</option>
              <option value="PARTIAL">Partial</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {props.initialTransactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No {TITLE.toLowerCase()} found.</td></tr>
              ) : (
                props.initialTransactions.map((item) => (
                  <tr key={item.id} onClick={() => router.push(`${DETAIL_PATH}/${item.id}`)} className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{item.docNo}</div>
                      {item.revisedFrom?.docNo ? <div className="mt-2 text-xs text-white/40">↳ Revision of {item.revisedFrom.docNo}</div> : null}
                    </td>
                    <td className="px-4 py-4">{formatDate(item.docDate)}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">{item.supplierName}</div>
                      <div className="text-xs text-white/45">{item.supplierAccountNo || "-"}</div>
                    </td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-4 text-right">{`${item.currency || "MYR"} ${money(item.grandTotal)}`}</td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== "CANCELLED" ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={(event) => { event.stopPropagation(); router.push(`${DETAIL_PATH}?edit=${item.id}`); }} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10">Edit</button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); router.push(`${DETAIL_PATH}?edit=${item.id}`); }} className="rounded-xl border border-sky-500/30 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/10">Edit Revise</button>
                        </div>
                      ) : <span className="text-xs text-white/35">Cancelled</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
      <form onSubmit={submit}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">{TITLE}</p>
            <h2 className="mt-3 text-3xl font-bold">{pageTitle}</h2>
          </div>
          {props.sourceDocuments.length > 0 && !editingTransaction ? (
            <button
              type="button"
              onClick={() => setActiveTab("HEADER")}
              className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
            >
              Generate From
            </button>
          ) : null}
        </div>

        {message ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {(["HEADER", "BODY", "FOOTER"] as ActiveTab[]).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-red-600 text-white" : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"}`}>{tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}</button>
          ))}
        </div>

        <div>
          {activeTab === "HEADER" ? (
            <div className="mt-6 space-y-6">
              {props.sourceDocuments.length > 0 && !editingTransaction ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <label className="label-rk">Generate From</label>
                  <select value={sourceTransaction?.id || ""} onChange={(event) => router.push(event.target.value ? `${DETAIL_PATH}?source=${event.target.value}` : DETAIL_PATH)} className="input-rk">
                    <option value="">Direct Create</option>
                    {props.sourceDocuments.map((source) => (<option key={source.id} value={source.id}>{source.docNo} — {source.supplierName} ({source.docType})</option>))}
                  </select>
                </div>
              ) : null}
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <div><label className="label-rk">Doc Date</label><input type="date" value={form.docDate} onChange={(e) => setForm((prev) => ({ ...prev, docDate: e.target.value }))} className="input-rk" /></div>
                <div className="xl:col-span-3"><label className="label-rk">System Doc No</label><div className="flex overflow-hidden rounded-xl border border-white/10 bg-black/40"><input value={manualDocNoEnabled ? docNo : editingTransaction?.docNo || ""} onChange={(e) => setDocNo(normalizeDocNoInput(e.target.value))} readOnly={!manualDocNoEnabled || Boolean(editingTransaction)} placeholder="Auto-generated" className="min-h-[52px] flex-1 bg-transparent px-4 text-white outline-none disabled:text-white/60" /><button type="button" disabled={Boolean(editingTransaction)} onClick={() => setManualDocNoEnabled((prev) => !prev)} className="px-4 text-xs text-white/45 hover:text-white disabled:opacity-40">{manualDocNoEnabled ? "Auto" : "Click to override"}</button></div></div>
                <div><label className="label-rk">A/C No</label><select value={form.supplierId} onChange={(e) => applySupplier(e.target.value)} required className="input-rk"><option value="">Search or select supplier</option>{props.initialSuppliers.map((supplier) => (<option key={supplier.id} value={supplier.id}>{supplier.supplierAccountNo ? `${supplier.supplierAccountNo} — ` : ""}{supplier.name}</option>))}</select></div>
                <div><label className="label-rk">Supplier Name</label><input value={form.supplierName} onChange={(e) => setForm((prev) => ({ ...prev, supplierName: e.target.value }))} className="input-rk" /></div>
                <div><label className="label-rk">Email</label><input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} className="input-rk" /></div>
                <div className="xl:col-span-2"><label className="label-rk">Document Description</label><input value={form.docDesc} onChange={(e) => setForm((prev) => ({ ...prev, docDesc: e.target.value }))} placeholder="Optional description" className="input-rk" /></div>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <div><label className="label-rk">Attention</label><input value={form.attention} onChange={(e) => setForm((prev) => ({ ...prev, attention: e.target.value }))} className="input-rk" /></div>
                <div><label className="label-rk">Contact No</label><input value={form.contactNo} onChange={(e) => setForm((prev) => ({ ...prev, contactNo: e.target.value }))} className="input-rk" /></div>
                <div><label className="label-rk">Agent</label><select value={form.agentId} onChange={(e) => setForm((prev) => ({ ...prev, agentId: e.target.value }))} className="input-rk"><option value="">No Agent</option>{props.initialAgents.map((item) => (<option key={item.id} value={item.id}>{item.code} — {item.name}</option>))}</select></div>
                {props.projectFeatureEnabled ? <div><label className="label-rk">Project</label><select value={form.projectId} onChange={(e) => setForm((prev) => ({ ...prev, projectId: e.target.value }))} className="input-rk"><option value="">No Project</option>{props.initialProjects.map((item) => (<option key={item.id} value={item.id}>{item.code} — {item.name}</option>))}</select></div> : null}
                {props.departmentFeatureEnabled ? <div><label className="label-rk">Department</label><select value={form.departmentId} onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value }))} className="input-rk"><option value="">No Department</option>{props.initialDepartments.map((item) => (<option key={item.id} value={item.id}>{item.code} — {item.name}</option>))}</select></div> : null}
              </div>
              <div className="rounded-[1.75rem] border border-white/10 p-5"><h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Billing Address</h3><div className="mt-5 grid gap-4 md:grid-cols-2"><div><label className="label-rk">Address Line 1</label><input className="input-rk" value={form.supplierId ? props.initialSuppliers.find((item) => item.id === form.supplierId)?.billingAddressLine1 || "" : ""} readOnly /></div><div><label className="label-rk">Address Line 2</label><input className="input-rk" value={form.supplierId ? props.initialSuppliers.find((item) => item.id === form.supplierId)?.billingAddressLine2 || "" : ""} readOnly /></div><div><label className="label-rk">Address Line 3</label><input className="input-rk" value={form.supplierId ? props.initialSuppliers.find((item) => item.id === form.supplierId)?.billingAddressLine3 || "" : ""} readOnly /></div><div><label className="label-rk">Address Line 4</label><input className="input-rk" value={form.supplierId ? props.initialSuppliers.find((item) => item.id === form.supplierId)?.billingAddressLine4 || "" : ""} readOnly /></div><div><label className="label-rk">City</label><input className="input-rk" value={form.supplierId ? props.initialSuppliers.find((item) => item.id === form.supplierId)?.billingCity || "" : ""} readOnly /></div><div><label className="label-rk">Post Code</label><input className="input-rk" value={form.supplierId ? props.initialSuppliers.find((item) => item.id === form.supplierId)?.billingPostCode || "" : ""} readOnly /></div></div></div>
            </div>
          ) : null}

          {activeTab === "BODY" ? (
            <div className="space-y-5">
              {lines.map((line, index) => {
                const product = props.initialProducts.find((item) => item.id === line.inventoryProductId) || null;
                return <div key={index} className="rounded-[1.75rem] border border-white/10 p-5"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold text-white">Product {index + 1}</h3>{lines.length > 1 ? <button type="button" onClick={() => removeLine(index)} className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10">Remove</button> : null}</div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"><div className="md:col-span-2"><label className="label-rk">Product</label><select value={line.inventoryProductId} onChange={(e) => applyProduct(index, e.target.value)} className="input-rk"><option value="">Search or select product</option>{props.initialProducts.map((item) => (<option key={item.id} value={item.id}>{item.code} — {item.description}</option>))}</select></div><div><label className="label-rk">UOM</label><select value={line.uom} onChange={(e) => updateLine(index, "uom", e.target.value)} className="input-rk"><option value="">Select UOM</option>{getProductUomOptions(product).map((option) => (<option key={option.id} value={option.id}>{option.label}</option>))}</select></div><div><label className="label-rk">Qty</label><input value={line.qty} onChange={(e) => updateLine(index, "qty", e.target.value)} className="input-rk" /></div><div><label className="label-rk">Purchase Unit Cost</label><input value={line.unitCost} onChange={(e) => updateLine(index, "unitCost", e.target.value)} className="input-rk" /></div><div><label className="label-rk">Discount</label><div className="grid grid-cols-[1fr_120px] gap-3"><input value={line.discountRate} onChange={(e) => updateLine(index, "discountRate", e.target.value)} className="input-rk" /><select value={line.discountType} onChange={(e) => updateLine(index, "discountType", e.target.value)} className="input-rk"><option value="PERCENT">%</option><option value="AMOUNT">Amount</option></select></div></div><div className="md:col-span-2"><label className="label-rk">Location</label><select value={line.locationId} onChange={(e) => updateLine(index, "locationId", e.target.value)} className="input-rk"><option value="">No Location</option>{props.initialLocations.map((item) => (<option key={item.id} value={item.id}>{item.code} — {item.name}</option>))}</select><p className="mt-2 text-xs text-white/40">Purchase stock will be received into this location where applicable.</p></div><div><label className="label-rk">Batch No</label><input value={line.batchNo} onChange={(e) => updateLine(index, "batchNo", e.target.value.toUpperCase())} className="input-rk" /></div>{props.taxConfig.taxModuleEnabled && taxMode === "LINE_ITEM" ? <div><label className="label-rk">Tax Code</label><select value={line.taxCodeId} onChange={(e) => updateLine(index, "taxCodeId", e.target.value)} className="input-rk"><option value="">No Tax</option>{props.taxConfig.taxCodes.map((tax) => (<option key={tax.id} value={tax.id}>{tax.code}</option>))}</select></div> : null}<div className="md:col-span-2 xl:col-span-4"><label className="label-rk">Product Remarks</label><textarea value={line.remarks} onChange={(e) => updateLine(index, "remarks", e.target.value)} className="input-rk min-h-[80px]" /></div><div><label className="label-rk">Gross Amount</label><input value={money(lineAmount(line))} readOnly className="input-rk" /></div></div></div>;
              })}
              <button type="button" onClick={addLine} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">+ Add Product</button>
            </div>
          ) : null}

          {activeTab === "FOOTER" ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-5"><div><label className="label-rk">Terms & Conditions</label><textarea value={form.termsAndConditions} onChange={(e) => setForm((prev) => ({ ...prev, termsAndConditions: e.target.value }))} placeholder="Enter terms manually. Template picker can be added in later phase." className="input-rk min-h-[140px]" /></div><div><label className="label-rk">Bank Account</label><textarea value={form.bankAccount} onChange={(e) => setForm((prev) => ({ ...prev, bankAccount: e.target.value }))} className="input-rk min-h-[100px]" /></div><div><label className="label-rk">Footer Remarks</label><textarea value={form.footerRemarks} onChange={(e) => setForm((prev) => ({ ...prev, footerRemarks: e.target.value }))} className="input-rk min-h-[100px]" /></div></div>
              <div className="h-fit rounded-[1.75rem] border border-white/10 bg-black/30 p-5 text-sm"><h3 className="text-xl font-semibold text-white">{TITLE} Summary</h3><div className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><span className="text-white/70">Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="flex justify-between"><span className="text-white/70">Discount</span><span>{money(totals.discount)}</span></div><div className="flex justify-between border-t border-white/10 pt-4"><span className="text-white/70">Tax</span><span>{money(totals.tax)}</span></div><div className="flex justify-between border-t border-white/10 pt-5 text-lg font-bold"><span>Grand Total ({form.currency || "MYR"})</span><span>{money(totals.grandTotal)}</span></div></div></div>
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-white/10 pt-5"><button type="button" onClick={() => { setIsCreateOpen(false); router.push(DETAIL_PATH); }} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Close</button><button type="submit" disabled={isSubmitting} className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Saving..." : `Save ${TITLE}`}</button></div>
      </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
