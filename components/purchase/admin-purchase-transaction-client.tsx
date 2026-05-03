"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  normalizeTaxCalculationMode,
  roundMoney,
  type TaxCalculationMethodValue,
  type TaxCalculationModeValue,
} from "@/lib/tax";

type DocType = "PO" | "GRN" | "PI";
type SupplierOption = {
  id: string;
  name: string;
  supplierAccountNo?: string | null;
  email?: string | null;
  phone?: string | null;
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

type ProductOption = {
  id: string;
  code: string;
  description: string;
  baseUom: string;
  unitCost: number | string;
  itemType: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM";
  batchTracking: boolean;
  serialNumberTracking: boolean;
  isAssemblyItem: boolean;
  uomConversions?: Array<{ id?: string; uomCode: string; conversionRate: number }>;
};

type SimpleOption = { id: string; code: string; name: string; isActive?: boolean; projectId?: string };
type TaxCodeOption = { id: string; code: string; description: string; rate: number; calculationMethod: TaxCalculationMethodValue };
type SourceLine = {
  id: string;
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
  uom?: string | null;
  qty?: number | string | null;
  remainingQty?: number;
  unitCost?: number | string | null;
  locationId?: string | null;
  batchNo?: string | null;
  taxCodeId?: string | null;
  remarks?: string | null;
};
type SourceDocument = {
  id: string;
  docType: DocType;
  docNo: string;
  docDate: string | Date;
  supplierId: string;
  supplierName: string;
  supplierAccountNo?: string | null;
  contactNo?: string | null;
  email?: string | null;
  currency?: string | null;
  reference?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  remarks?: string | null;
  termsAndConditions?: string | null;
  bankAccount?: string | null;
  footerRemarks?: string | null;
  lines: SourceLine[];
};
type ExistingTransaction = SourceDocument & {
  status: string;
  id: string;
  docDesc?: string | null;
  lines: SourceLine[];
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

type Props = {
  docType: DocType;
  title: string;
  description: string;
  apiPath: string;
  initialTransactions: ExistingTransaction[];
  sourceDocuments: SourceDocument[];
  suppliers: SupplierOption[];
  products: ProductOption[];
  locations: SimpleOption[];
  agents: SimpleOption[];
  projects: SimpleOption[];
  departments: SimpleOption[];
  defaultLocationId: string;
  projectFeatureEnabled: boolean;
  departmentFeatureEnabled: boolean;
  taxConfig: {
    taxModuleEnabled: boolean;
    taxCalculationMode: TaxCalculationModeValue;
    defaultAdminTaxCodeId?: string | null;
    taxCodes: TaxCodeOption[];
  };
};

const DOC_LABEL: Record<DocType, string> = { PO: "Purchase Order", GRN: "Goods Received Note", PI: "Purchase Invoice" };
const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (defaultLocationId = ""): LineForm => ({ sourceLineId: "", sourceTransactionId: "", inventoryProductId: "", productCode: "", productDescription: "", itemType: "STOCK_ITEM", uom: "PCS", qty: "1", unitCost: "0.00", discountRate: "0", discountType: "PERCENT", locationId: defaultLocationId, batchNo: "", taxCodeId: "", remarks: "" });
function money(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"; }
function formatDate(value: string | Date | null | undefined) { if (!value) return "-"; const d = new Date(value); if (Number.isNaN(d.getTime())) return "-"; return d.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" }); }
function toInputDate(value: string | Date | null | undefined) { if (!value) return today(); const d = new Date(value); if (Number.isNaN(d.getTime())) return today(); return d.toISOString().slice(0, 10); }

export function AdminPurchaseTransactionClient(props: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState(props.initialTransactions);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExistingTransaction | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    docDate: today(), docDesc: props.title, supplierId: "", supplierName: "", supplierAccountNo: "", contactNo: "", email: "", currency: "MYR", reference: "", remarks: "", agentId: "", projectId: "", departmentId: "", taxCodeId: "", termsAndConditions: "", bankAccount: "", footerRemarks: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine(props.defaultLocationId)]);

  const selectedSupplier = props.suppliers.find((item) => item.id === form.supplierId) || null;
  const selectedSource = props.sourceDocuments.find((item) => item.id === selectedSourceId) || null;
  const taxMode = normalizeTaxCalculationMode(props.taxConfig.taxCalculationMode);
  const headerTaxCode = props.taxConfig.taxCodes.find((item) => item.id === form.taxCodeId) || null;

  const totals = useMemo(() => {
    const mapped = lines.map((line) => {
      const qty = Math.max(0, Number(line.qty || 0));
      const unitCost = Math.max(0, Number(line.unitCost || 0));
      const subtotal = roundMoney(qty * unitCost);
      const discountRate = Math.max(0, Number(line.discountRate || 0));
      const discount = line.discountType === "AMOUNT" ? discountRate : roundMoney(subtotal * (discountRate / 100));
      const lineTotal = Math.max(0, roundMoney(subtotal - discount));
      const lineTaxCode = props.taxConfig.taxCodes.find((item) => item.id === line.taxCodeId) || (taxMode === "LINE_ITEM" ? props.taxConfig.taxCodes.find((item) => item.id === props.taxConfig.defaultAdminTaxCodeId) : null);
      const tax = calculateLineItemTaxBreakdown({ lineTotal, taxRate: lineTaxCode?.rate || 0, calculationMethod: lineTaxCode?.calculationMethod || null, taxEnabled: props.taxConfig.taxModuleEnabled && Boolean(lineTaxCode) });
      return { subtotal, discount, total: tax.lineGrandTotalAfterTax, tax: tax.taxAmount };
    });
    const subtotal = roundMoney(mapped.reduce((sum, line) => sum + line.subtotal, 0));
    const discount = roundMoney(mapped.reduce((sum, line) => sum + line.discount, 0));
    if (taxMode === "LINE_ITEM") return { subtotal, discount, tax: roundMoney(mapped.reduce((sum, line) => sum + line.tax, 0)), grand: roundMoney(mapped.reduce((sum, line) => sum + line.total, 0)) };
    const tax = calculateTaxBreakdown({ subtotal, discount, taxRate: headerTaxCode?.rate || 0, calculationMethod: headerTaxCode?.calculationMethod || null, taxEnabled: props.taxConfig.taxModuleEnabled && Boolean(headerTaxCode) });
    return { subtotal, discount, tax: tax.taxAmount, grand: tax.grandTotalAfterTax };
  }, [lines, props.taxConfig, taxMode, headerTaxCode]);

  function resetForm() {
    setEditing(null); setSelectedSourceId(""); setError(""); setMessage("");
    setForm({ docDate: today(), docDesc: props.title, supplierId: "", supplierName: "", supplierAccountNo: "", contactNo: "", email: "", currency: "MYR", reference: "", remarks: "", agentId: "", projectId: "", departmentId: "", taxCodeId: "", termsAndConditions: "", bankAccount: "", footerRemarks: "" });
    setLines([emptyLine(props.defaultLocationId)]);
  }
  function openCreate() { resetForm(); setIsFormOpen(true); }
  function openEdit(tx: ExistingTransaction) {
    setEditing(tx); setSelectedSourceId(""); setError("");
    setForm({ docDate: toInputDate(tx.docDate), docDesc: tx.docDesc || props.title, supplierId: tx.supplierId, supplierName: tx.supplierName, supplierAccountNo: tx.supplierAccountNo || "", contactNo: tx.contactNo || "", email: tx.email || "", currency: tx.currency || "MYR", reference: tx.reference || "", remarks: tx.remarks || "", agentId: tx.agentId || "", projectId: tx.projectId || "", departmentId: tx.departmentId || "", taxCodeId: "", termsAndConditions: tx.termsAndConditions || "", bankAccount: tx.bankAccount || "", footerRemarks: tx.footerRemarks || "" });
    setLines((tx.lines || []).map((line) => ({ sourceLineId: "", sourceTransactionId: "", inventoryProductId: line.inventoryProductId || "", productCode: line.productCode || "", productDescription: line.productDescription || "", itemType: line.itemType || "STOCK_ITEM", uom: line.uom || "PCS", qty: String(line.qty || "1"), unitCost: String(line.unitCost || "0"), discountRate: "0", discountType: "PERCENT", locationId: line.locationId || props.defaultLocationId, batchNo: line.batchNo || "", taxCodeId: line.taxCodeId || "", remarks: line.remarks || "" })));
    setIsFormOpen(true);
  }
  function applySupplier(id: string) {
    const supplier = props.suppliers.find((item) => item.id === id);
    setForm((prev) => ({ ...prev, supplierId: id, supplierName: supplier?.name || "", supplierAccountNo: supplier?.supplierAccountNo || "", contactNo: supplier?.phone || "", email: supplier?.email || "", currency: supplier?.currency || "MYR", agentId: supplier?.agentId || "" }));
  }
  function applyProduct(index: number, id: string) {
    const product = props.products.find((item) => item.id === id);
    setLines((prev) => prev.map((line, lineIndex) => lineIndex === index ? { ...line, inventoryProductId: id, productCode: product?.code || "", productDescription: product?.description || "", itemType: product?.itemType || "STOCK_ITEM", uom: product?.baseUom || "PCS", unitCost: String(product?.unitCost ?? "0"), locationId: line.locationId || props.defaultLocationId } : line));
  }
  function applySource(id: string) {
    setSelectedSourceId(id);
    const source = props.sourceDocuments.find((item) => item.id === id);
    if (!source) return;
    setForm((prev) => ({ ...prev, supplierId: source.supplierId, supplierName: source.supplierName, supplierAccountNo: source.supplierAccountNo || "", contactNo: source.contactNo || "", email: source.email || "", currency: source.currency || "MYR", reference: source.docNo, agentId: source.agentId || "", projectId: source.projectId || "", departmentId: source.departmentId || "", remarks: source.remarks || "", termsAndConditions: source.termsAndConditions || "", bankAccount: source.bankAccount || "", footerRemarks: source.footerRemarks || "" }));
    setLines(source.lines.map((line) => ({ sourceLineId: line.id, sourceTransactionId: source.id, inventoryProductId: line.inventoryProductId || "", productCode: line.productCode || "", productDescription: line.productDescription || "", itemType: line.itemType || "STOCK_ITEM", uom: line.uom || "PCS", qty: String(line.remainingQty ?? line.qty ?? 1), unitCost: String(line.unitCost || "0"), discountRate: "0", discountType: "PERCENT", locationId: line.locationId || props.defaultLocationId, batchNo: line.batchNo || "", taxCodeId: line.taxCodeId || "", remarks: line.remarks || "" })));
  }
  function updateLine(index: number, key: keyof LineForm, value: string) { setLines((prev) => prev.map((line, i) => i === index ? { ...line, [key]: value } : line)); }
  function addLine() { setLines((prev) => [...prev, emptyLine(props.defaultLocationId)]); }
  function removeLine(index: number) { setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMessage(""); setIsSubmitting(true);
    try {
      const response = await fetch(editing ? `${props.apiPath}/${editing.id}` : props.apiPath, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, sourceTransactionId: selectedSourceId || null, sourceDocType: selectedSource?.docType || null, lines }) });
      const data = await response.json();
      if (!response.ok || !data.ok) { setError(data.error || `Unable to save ${props.title}.`); return; }
      setMessage(`${props.title} saved successfully.`); setIsFormOpen(false); router.refresh();
    } catch { setError(`Unable to save ${props.title}.`); } finally { setIsSubmitting(false); }
  }
  async function cancelTransaction(tx: ExistingTransaction) {
    const reason = window.prompt(`Cancel ${tx.docNo}? Enter reason:`, "Cancelled by admin");
    if (reason === null) return;
    setError(""); setMessage("");
    const response = await fetch(`${props.apiPath}/${tx.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const data = await response.json();
    if (!response.ok || !data.ok) { setError(data.error || `Unable to cancel ${tx.docNo}.`); return; }
    setMessage(`${tx.docNo} cancelled successfully.`); router.refresh();
  }

  return <div className="space-y-6">
    {message ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{message}</div> : null}
    {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
    <div className="rounded-3xl border border-white/20 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold text-white">{props.title} Records</h2><p className="mt-1 text-sm text-white/45">Header, body and footer purchase transaction entry.</p></div>
        <button type="button" onClick={openCreate} className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10">Add {props.title}</button>
      </div>
      <div className="overflow-x-auto border-t border-white/10">
        <table className="min-w-[980px] text-left text-sm"><thead className="bg-black/50 text-white/65"><tr><th className="px-4 py-4">Doc No.</th><th className="px-4 py-4">Date</th><th className="px-4 py-4">Supplier</th><th className="px-4 py-4">Reference</th><th className="px-4 py-4">Status</th><th className="px-4 py-4 text-right">Amount</th><th className="px-4 py-4">Action</th></tr></thead>
        <tbody>{transactions.length ? transactions.map((tx) => <tr key={tx.id} className="border-t border-white/10 align-top hover:bg-white/[0.03]"><td className="px-4 py-4 font-semibold text-white">{tx.docNo}</td><td className="px-4 py-4 text-white/65">{formatDate(tx.docDate)}</td><td className="px-4 py-4"><div className="text-white">{tx.supplierName}</div><div className="text-xs text-white/45">{tx.supplierAccountNo || "-"}</div></td><td className="px-4 py-4 text-white/65">{tx.reference || "-"}</td><td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs ${tx.status === "CANCELLED" ? "border-red-500/30 bg-red-500/10 text-red-300" : tx.status === "COMPLETED" ? "border-sky-500/30 bg-sky-500/10 text-sky-300" : tx.status === "PARTIAL" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-white/15 bg-white/5 text-white/75"}`}>{tx.status}</span></td><td className="px-4 py-4 text-right text-white">{money((tx as any).grandTotal)}</td><td className="px-4 py-4"><div className="flex gap-2"><button type="button" onClick={() => openEdit(tx)} className="rounded-xl border border-white/15 px-3 py-2 text-white/75 hover:bg-white/10">Edit</button>{tx.status !== "CANCELLED" ? <button type="button" onClick={() => cancelTransaction(tx)} className="rounded-xl border border-red-500/30 px-3 py-2 text-red-300 hover:bg-red-500/10">Cancel</button> : null}</div></td></tr>) : <tr><td colSpan={7} className="px-4 py-12 text-center text-white/45">No {props.title.toLowerCase()} records found.</td></tr>}</tbody></table>
      </div>
    </div>
    {isFormOpen ? <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/70 px-4 py-6"><div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold text-white">{editing ? "Edit" : "Add"} {props.title}</h3><p className="mt-1 text-sm text-white/50">Same structure as Sales: Header, Body and Footer.</p></div><button type="button" onClick={() => setIsFormOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-white/75 hover:bg-white/10">Close</button></div>
      <form onSubmit={submit} className="mt-6 space-y-6">
        {props.sourceDocuments.length > 0 && !editing ? <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><label className="mb-2 block text-sm text-white/70">Generate From</label><select value={selectedSourceId} onChange={(e) => applySource(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white"><option value="">Direct Create</option>{props.sourceDocuments.map((source) => <option key={source.id} value={source.id}>{source.docNo} — {source.supplierName} ({source.docType})</option>)}</select></div> : null}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Header</div><div className="mt-4 grid gap-4 md:grid-cols-3"><div><label className="label-rk">Doc Date</label><input type="date" value={form.docDate} onChange={(e) => setForm((p) => ({ ...p, docDate: e.target.value }))} className="input-rk" /></div><div><label className="label-rk">Description</label><input value={form.docDesc} onChange={(e) => setForm((p) => ({ ...p, docDesc: e.target.value }))} className="input-rk" /></div><div><label className="label-rk">Supplier</label><select value={form.supplierId} onChange={(e) => applySupplier(e.target.value)} required className="input-rk"><option value="">Select supplier</option>{props.suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplierAccountNo ? `${s.supplierAccountNo} — ` : ""}{s.name}</option>)}</select></div><div><label className="label-rk">Contact</label><input value={form.contactNo} onChange={(e) => setForm((p) => ({ ...p, contactNo: e.target.value }))} className="input-rk" /></div><div><label className="label-rk">Email</label><input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="input-rk" /></div><div><label className="label-rk">Currency</label><input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} className="input-rk" /></div><div><label className="label-rk">Reference</label><input value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} className="input-rk" /></div><div><label className="label-rk">Agent</label><select value={form.agentId} onChange={(e) => setForm((p) => ({ ...p, agentId: e.target.value }))} className="input-rk"><option value="">No Agent</option>{props.agents.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></div>{props.projectFeatureEnabled ? <div><label className="label-rk">Project</label><select value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))} className="input-rk"><option value="">No Project</option>{props.projects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></div> : null}{props.departmentFeatureEnabled ? <div><label className="label-rk">Department</label><select value={form.departmentId} onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))} className="input-rk"><option value="">No Department</option>{props.departments.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></div> : null}{props.taxConfig.taxModuleEnabled && taxMode === "TRANSACTION" ? <div><label className="label-rk">Tax Code</label><select value={form.taxCodeId} onChange={(e) => setForm((p) => ({ ...p, taxCodeId: e.target.value }))} className="input-rk"><option value="">No Tax</option>{props.taxConfig.taxCodes.map((tax) => <option key={tax.id} value={tax.id}>{tax.code} — {tax.description} ({tax.rate}%)</option>)}</select></div> : null}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="flex items-center justify-between"><div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Body</div><button type="button" onClick={addLine} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/75 hover:bg-white/10">+ Add Line</button></div><div className="mt-4 overflow-x-auto"><table className="min-w-[1180px] text-left text-sm"><thead className="text-white/50"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">UOM</th><th className="px-3 py-2">Unit Cost</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Batch No</th><th className="px-3 py-2">Tax</th><th className="px-3 py-2">Remarks</th><th></th></tr></thead><tbody>{lines.map((line, index) => <tr key={index} className="border-t border-white/10"><td className="px-3 py-2"><select value={line.inventoryProductId} onChange={(e) => applyProduct(index, e.target.value)} className="input-rk min-w-[180px]"><option value="">Select</option>{props.products.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></td><td className="px-3 py-2"><input value={line.productDescription} onChange={(e) => updateLine(index, "productDescription", e.target.value)} className="input-rk min-w-[220px]" /></td><td className="px-3 py-2"><input type="number" min="0.001" step="0.001" value={line.qty} onChange={(e) => updateLine(index, "qty", e.target.value)} className="input-rk w-28" /></td><td className="px-3 py-2"><input value={line.uom} onChange={(e) => updateLine(index, "uom", e.target.value.toUpperCase())} className="input-rk w-24" /></td><td className="px-3 py-2"><input type="number" min="0" step="0.001" value={line.unitCost} onChange={(e) => updateLine(index, "unitCost", e.target.value)} className="input-rk w-32" /></td><td className="px-3 py-2"><select value={line.locationId} onChange={(e) => updateLine(index, "locationId", e.target.value)} className="input-rk min-w-[160px]"><option value="">No Location</option>{props.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>)}</select></td><td className="px-3 py-2"><input value={line.batchNo} onChange={(e) => updateLine(index, "batchNo", e.target.value.toUpperCase())} className="input-rk w-32" /></td><td className="px-3 py-2"><select value={line.taxCodeId} onChange={(e) => updateLine(index, "taxCodeId", e.target.value)} className="input-rk min-w-[140px]" disabled={!props.taxConfig.taxModuleEnabled || taxMode !== "LINE_ITEM"}><option value="">No Tax</option>{props.taxConfig.taxCodes.map((tax) => <option key={tax.id} value={tax.id}>{tax.code}</option>)}</select></td><td className="px-3 py-2"><input value={line.remarks} onChange={(e) => updateLine(index, "remarks", e.target.value)} className="input-rk min-w-[160px]" /></td><td className="px-3 py-2"><button type="button" onClick={() => removeLine(index)} className="rounded-xl border border-red-500/30 px-3 py-2 text-red-300 hover:bg-red-500/10">Remove</button></td></tr>)}</tbody></table></div></div>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><div className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Footer</div><div className="mt-4 grid gap-4 md:grid-cols-2"><textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} placeholder="Remarks" className="input-rk min-h-28" /><textarea value={form.footerRemarks} onChange={(e) => setForm((p) => ({ ...p, footerRemarks: e.target.value }))} placeholder="Footer remarks" className="input-rk min-h-28" /><textarea value={form.termsAndConditions} onChange={(e) => setForm((p) => ({ ...p, termsAndConditions: e.target.value }))} placeholder="Terms and conditions" className="input-rk min-h-28" /><textarea value={form.bankAccount} onChange={(e) => setForm((p) => ({ ...p, bankAccount: e.target.value }))} placeholder="Bank account" className="input-rk min-h-28" /></div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm"><div className="flex justify-between py-2 text-white/65"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="flex justify-between py-2 text-white/65"><span>Discount</span><span>{money(totals.discount)}</span></div><div className="flex justify-between py-2 text-white/65"><span>Tax</span><span>{money(totals.tax)}</span></div><div className="mt-3 flex justify-between border-t border-white/10 pt-4 text-lg font-semibold text-white"><span>Grand Total</span><span>{money(totals.grand)}</span></div></div></div>
        <div className="flex justify-end gap-3"><button type="button" onClick={() => setIsFormOpen(false)} className="rounded-xl border border-white/15 px-4 py-3 text-white/75 hover:bg-white/10">Cancel</button><button type="submit" disabled={isSubmitting} className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50">{isSubmitting ? "Saving..." : "Save"}</button></div>
      </form></div></div> : null}
  </div>;
}
