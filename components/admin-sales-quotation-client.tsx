"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CustomerOption = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  customerAccountNo?: string | null;
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
  sellingPrice: number;
};

type AgentOption = { id: string; code: string; name: string; isActive: boolean };
type ProjectOption = { id: string; code: string; name: string; isActive: boolean };
type DepartmentOption = { id: string; code: string; name: string; projectId: string; isActive: boolean };

type QuotationRecord = {
  id: string;
  docNo: string;
  docDate: string;
  customerName: string;
  customerAccountNo?: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  grandTotal: string | number;
};

type Props = {
  initialCustomers: CustomerOption[];
  initialProducts: ProductOption[];
  initialAgents: AgentOption[];
  initialProjects: ProjectOption[];
  initialDepartments: DepartmentOption[];
  projectFeatureEnabled: boolean;
  departmentFeatureEnabled: boolean;
};

type LineForm = {
  inventoryProductId: string;
  productCode: string;
  productDescription: string;
  uom: string;
  qty: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
  remarks: string;
};

function emptyLine(): LineForm {
  return {
    inventoryProductId: "",
    productCode: "",
    productDescription: "",
    uom: "",
    qty: "1",
    unitPrice: "0.00",
    discountRate: "0",
    taxRate: "0",
    remarks: "",
  };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
}

function getStatusClass(status: string) {
  if (status === "CANCELLED") return "border-red-500/25 bg-red-500/10 text-red-200";
  if (status === "CONFIRMED") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  return "border-amber-500/25 bg-amber-500/10 text-amber-200";
}

export function AdminSalesQuotationClient({
  initialCustomers,
  initialProducts,
  initialAgents,
  initialProjects,
  initialDepartments,
  projectFeatureEnabled,
  departmentFeatureEnabled,
}: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<QuotationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"HEADER" | "BODY" | "FOOTER">("HEADER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [cancelTarget, setCancelTarget] = useState<QuotationRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [docDate, setDocDate] = useState(todayInput());
  const [docNo, setDocNo] = useState("");
  const [docDesc, setDocDesc] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerAccountNo, setCustomerAccountNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [billingAddressLine1, setBillingAddressLine1] = useState("");
  const [billingAddressLine2, setBillingAddressLine2] = useState("");
  const [billingAddressLine3, setBillingAddressLine3] = useState("");
  const [billingAddressLine4, setBillingAddressLine4] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingPostCode, setBillingPostCode] = useState("");
  const [billingCountryCode, setBillingCountryCode] = useState("MY");
  const [deliveryAddressLine1, setDeliveryAddressLine1] = useState("");
  const [deliveryAddressLine2, setDeliveryAddressLine2] = useState("");
  const [deliveryAddressLine3, setDeliveryAddressLine3] = useState("");
  const [deliveryAddressLine4, setDeliveryAddressLine4] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryPostCode, setDeliveryPostCode] = useState("");
  const [deliveryCountryCode, setDeliveryCountryCode] = useState("MY");
  const [attention, setAttention] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [footerRemarks, setFooterRemarks] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);

  const filteredDepartments = useMemo(
    () => initialDepartments.filter((item) => item.projectId === projectId && item.isActive),
    [initialDepartments, projectId]
  );

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const qty = Number(line.qty || 0);
        const unitPrice = Number(line.unitPrice || 0);
        const discountRate = Number(line.discountRate || 0);
        const taxRate = Number(line.taxRate || 0);
        const subtotal = Number.isFinite(qty * unitPrice) ? qty * unitPrice : 0;
        const discount = subtotal * ((Number.isFinite(discountRate) ? discountRate : 0) / 100);
        const taxable = subtotal - discount;
        const tax = taxable * ((Number.isFinite(taxRate) ? taxRate : 0) / 100);
        const total = taxable + tax;
        return {
          subtotal: acc.subtotal + subtotal,
          discountTotal: acc.discountTotal + discount,
          taxTotal: acc.taxTotal + tax,
          grandTotal: acc.grandTotal + total,
        };
      },
      { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
    );
  }, [lines]);

  async function loadTransactions() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set("q", searchKeyword.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/sales/quotation?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setTransactions(response.ok && data.ok && Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, [searchKeyword, statusFilter]);

  function resetForm() {
    setActiveTab("HEADER");
    setDocDate(todayInput());
    setDocNo("");
    setDocDesc("");
    setCustomerId("");
    setCustomerAccountNo("");
    setCustomerName("");
    setBillingAddressLine1("");
    setBillingAddressLine2("");
    setBillingAddressLine3("");
    setBillingAddressLine4("");
    setBillingCity("");
    setBillingPostCode("");
    setBillingCountryCode("MY");
    setDeliveryAddressLine1("");
    setDeliveryAddressLine2("");
    setDeliveryAddressLine3("");
    setDeliveryAddressLine4("");
    setDeliveryCity("");
    setDeliveryPostCode("");
    setDeliveryCountryCode("MY");
    setAttention("");
    setContactNo("");
    setEmail("");
    setCurrency("MYR");
    setReference("");
    setRemarks("");
    setAgentId("");
    setProjectId("");
    setDepartmentId("");
    setTermsAndConditions("");
    setBankAccount("");
    setFooterRemarks("");
    setLines([emptyLine()]);
    setSubmitError("");
    setSubmitSuccess("");
  }

  function openCreate() {
    resetForm();
    setIsCreateOpen(true);
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = initialCustomers.find((item) => item.id === nextCustomerId);
    if (!customer) return;
    setCustomerAccountNo(customer.customerAccountNo || "");
    setCustomerName(customer.name || "");
    setBillingAddressLine1(customer.billingAddressLine1 || "");
    setBillingAddressLine2(customer.billingAddressLine2 || "");
    setBillingAddressLine3(customer.billingAddressLine3 || "");
    setBillingAddressLine4(customer.billingAddressLine4 || "");
    setBillingCity(customer.billingCity || "");
    setBillingPostCode(customer.billingPostCode || "");
    setBillingCountryCode(customer.billingCountryCode || "MY");
    setDeliveryAddressLine1(customer.deliveryAddressLine1 || "");
    setDeliveryAddressLine2(customer.deliveryAddressLine2 || "");
    setDeliveryAddressLine3(customer.deliveryAddressLine3 || "");
    setDeliveryAddressLine4(customer.deliveryAddressLine4 || "");
    setDeliveryCity(customer.deliveryCity || "");
    setDeliveryPostCode(customer.deliveryPostCode || "");
    setDeliveryCountryCode(customer.deliveryCountryCode || "MY");
    setAttention(customer.attention || "");
    setContactNo(customer.phone || "");
    setEmail(customer.email || "");
    setCurrency(customer.currency || "MYR");
    setAgentId(customer.agentId || "");
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function handleProductChange(index: number, productId: string) {
    const product = initialProducts.find((item) => item.id === productId);
    if (!product) {
      updateLine(index, { inventoryProductId: "", productCode: "", productDescription: "", uom: "", unitPrice: "0.00" });
      return;
    }
    updateLine(index, {
      inventoryProductId: product.id,
      productCode: product.code,
      productDescription: product.description,
      uom: product.baseUom,
      unitPrice: String(product.sellingPrice.toFixed(2)),
    });
  }

  async function submitQuotation() {
    setSubmitError("");
    setSubmitSuccess("");
    setIsSubmitting(true);
    try {
      const payload = {
        docDate,
        docNo,
        docDesc,
        customerId,
        billingAddressLine1,
        billingAddressLine2,
        billingAddressLine3,
        billingAddressLine4,
        billingCity,
        billingPostCode,
        billingCountryCode,
        deliveryAddressLine1,
        deliveryAddressLine2,
        deliveryAddressLine3,
        deliveryAddressLine4,
        deliveryCity,
        deliveryPostCode,
        deliveryCountryCode,
        attention,
        contactNo,
        email,
        currency,
        reference,
        remarks,
        agentId,
        projectId,
        departmentId,
        termsAndConditions,
        bankAccount,
        footerRemarks,
        lines,
      };
      const response = await fetch("/api/admin/sales/quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create quotation.");
      setSubmitSuccess("Quotation created successfully.");
      setIsCreateOpen(false);
      await loadTransactions();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create quotation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelQuotation() {
    if (!cancelTarget) return;
    try {
      const response = await fetch(`/api/admin/sales/quotation/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", cancelReason }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to cancel quotation.");
      setCancelTarget(null);
      setCancelReason("");
      await loadTransactions();
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to cancel quotation.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Sales</p>
          <h1 className="mt-3 text-4xl font-bold">Quotation</h1>
          <p className="mt-4 max-w-3xl text-white/70">Create and manage quotation documents. Quotation does not affect stock or sales figures.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500">
          Create Quotation
        </button>
      </div>

      {submitSuccess ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{submitSuccess}</div> : null}

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <input className="input-rk" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search quotation no, customer, reference" />
          <select className="input-rk" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-white/45">
              <tr>
                <th className="px-4 py-3">Doc No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading quotations...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No quotation found.</td></tr>
              ) : (
                transactions.map((item) => (
                  <tr key={item.id} className="text-white/80">
                    <td className="px-4 py-4 font-semibold text-white">{item.docNo}</td>
                    <td className="px-4 py-4">{formatDate(item.docDate)}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white/90">{item.customerName}</div>
                      <div className="text-xs text-white/45">{item.customerAccountNo || "-"}</div>
                    </td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-4 text-right">{money(Number(item.grandTotal || 0))}</td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== "CANCELLED" ? (
                        <button type="button" onClick={() => setCancelTarget(item)} className="rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10">
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-white/35">Cancelled</span>
                      )}
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Sales Quotation</p>
                <h2 className="mt-3 text-3xl font-bold">Create Quotation</h2>
                <p className="mt-3 text-sm text-white/60">One quotation form split into Header, Body, and Footer tabs.</p>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-white/75 transition hover:bg-white/10">Close</button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
              {(["HEADER", "BODY", "FOOTER"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-red-600 text-white" : "border border-white/10 text-white/65 hover:bg-white/10 hover:text-white"}`}
                >
                  {tab === "HEADER" ? "Header" : tab === "BODY" ? "Body" : "Footer"}
                </button>
              ))}
            </div>

            {submitError ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{submitError}</div> : null}

            {activeTab === "HEADER" ? (
              <div className="mt-6 space-y-6">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="label-rk">Customer</label>
                    <select className="input-rk" value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                      <option value="">Select customer</option>
                      {initialCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customerAccountNo ? `${customer.customerAccountNo} — ` : ""}{customer.name}</option>)}
                    </select>
                  </div>
                  <ReadonlyLike label="A/C No" value={customerAccountNo} />
                  <ReadonlyLike label="Customer Name" value={customerName} />
                  <ReadonlyLike label="Email" value={email} />
                  <div>
                    <label className="label-rk">Doc Date</label>
                    <input className="input-rk" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label-rk">Quotation No Override</label>
                    <input className="input-rk" value={docNo} onChange={(e) => setDocNo(e.target.value.toUpperCase())} placeholder="Auto Generated" />
                  </div>
                  <div className="xl:col-span-2">
                    <label className="label-rk">Document Description</label>
                    <input className="input-rk" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} placeholder="Optional description" />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <AddressPanel title="Billing Address" values={[billingAddressLine1, billingAddressLine2, billingAddressLine3, billingAddressLine4, billingCity, billingPostCode, billingCountryCode]} setters={[setBillingAddressLine1, setBillingAddressLine2, setBillingAddressLine3, setBillingAddressLine4, setBillingCity, setBillingPostCode, setBillingCountryCode]} />
                  <AddressPanel title="Delivery Address" values={[deliveryAddressLine1, deliveryAddressLine2, deliveryAddressLine3, deliveryAddressLine4, deliveryCity, deliveryPostCode, deliveryCountryCode]} setters={[setDeliveryAddressLine1, setDeliveryAddressLine2, setDeliveryAddressLine3, setDeliveryAddressLine4, setDeliveryCity, setDeliveryPostCode, setDeliveryCountryCode]} />
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <Input label="Attention" value={attention} onChange={setAttention} />
                  <Input label="Contact No" value={contactNo} onChange={setContactNo} />
                  <Input label="Currency" value={currency} onChange={setCurrency} />
                  <Input label="Reference" value={reference} onChange={setReference} />
                  <div>
                    <label className="label-rk">Agent</label>
                    <select className="input-rk" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                      <option value="">No Agent</option>
                      {initialAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.code} — {agent.name}</option>)}
                    </select>
                  </div>
                  {projectFeatureEnabled ? (
                    <div>
                      <label className="label-rk">Project</label>
                      <select className="input-rk" value={projectId} onChange={(e) => { setProjectId(e.target.value); setDepartmentId(""); }}>
                        <option value="">No Project</option>
                        {initialProjects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {departmentFeatureEnabled ? (
                    <div>
                      <label className="label-rk">Department</label>
                      <select className="input-rk" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!projectId}>
                        <option value="">No Department</option>
                        {filteredDepartments.map((department) => <option key={department.id} value={department.id}>{department.code} — {department.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                  <div className="xl:col-span-4">
                    <label className="label-rk">Remarks</label>
                    <textarea className="input-rk min-h-[90px]" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "BODY" ? (
              <div className="mt-6 space-y-5">
                {lines.map((line, index) => {
                  const qty = Number(line.qty || 0);
                  const price = Number(line.unitPrice || 0);
                  const discountRate = Number(line.discountRate || 0);
                  const taxRate = Number(line.taxRate || 0);
                  const subtotal = qty * price;
                  const discount = subtotal * (discountRate / 100);
                  const tax = (subtotal - discount) * (taxRate / 100);
                  const total = subtotal - discount + tax;
                  return (
                    <div key={index} className="rounded-[1.75rem] border border-white/10 p-5">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-white">Product {index + 1}</h3>
                        {lines.length > 1 ? <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10">Remove</button> : null}
                      </div>
                      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <div className="md:col-span-2">
                          <label className="label-rk">Product</label>
                          <select className="input-rk" value={line.inventoryProductId} onChange={(e) => handleProductChange(index, e.target.value)}>
                            <option value="">Select product</option>
                            {initialProducts.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.description}</option>)}
                          </select>
                        </div>
                        <Input label="Qty" value={line.qty} onChange={(value) => updateLine(index, { qty: value })} />
                        <Input label="UOM" value={line.uom} onChange={(value) => updateLine(index, { uom: value.toUpperCase() })} />
                        <Input label="Unit Price" value={line.unitPrice} onChange={(value) => updateLine(index, { unitPrice: value })} />
                        <Input label="Discount %" value={line.discountRate} onChange={(value) => updateLine(index, { discountRate: value })} />
                        <Input label="Tax %" value={line.taxRate} onChange={(value) => updateLine(index, { taxRate: value })} />
                        <ReadonlyLike label="Line Total" value={money(total || 0)} />
                        <div className="md:col-span-2 xl:col-span-4">
                          <label className="label-rk">Product Remarks</label>
                          <textarea className="input-rk min-h-[80px]" value={line.remarks} onChange={(e) => updateLine(index, { remarks: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">+ Add Product</button>
              </div>
            ) : null}

            {activeTab === "FOOTER" ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <div>
                    <label className="label-rk">Terms & Conditions</label>
                    <textarea className="input-rk min-h-[140px]" value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} placeholder="Enter terms manually. Template picker can be added in later phase." />
                  </div>
                  <div>
                    <label className="label-rk">Bank Account</label>
                    <textarea className="input-rk min-h-[100px]" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Enter bank details manually." />
                  </div>
                  <div>
                    <label className="label-rk">Footer Remarks</label>
                    <textarea className="input-rk min-h-[100px]" value={footerRemarks} onChange={(e) => setFooterRemarks(e.target.value)} />
                  </div>
                </div>
                <div className="h-fit rounded-[1.75rem] border border-white/10 bg-black/30 p-5 text-sm">
                  <h3 className="text-xl font-semibold text-white">Quotation Summary</h3>
                  <SummaryRow label="Subtotal" value={money(totals.subtotal)} />
                  <SummaryRow label="Discount" value={money(totals.discountTotal)} />
                  <SummaryRow label="Tax" value={money(totals.taxTotal)} />
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <SummaryRow label="Grand Total" value={money(totals.grandTotal)} strong />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              <button type="button" onClick={submitQuotation} disabled={isSubmitting} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving..." : "Save Quotation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#08080c] p-6 shadow-2xl">
            <h3 className="text-2xl font-bold text-white">Cancel Quotation</h3>
            <p className="mt-3 text-sm text-white/60">Please enter a reason to cancel {cancelTarget.docNo}.</p>
            <textarea className="input-rk mt-5 min-h-[120px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Cancellation reason" />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelTarget(null)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10">Close</button>
              <button type="button" onClick={cancelQuotation} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">Confirm Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ReadonlyLike({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value || ""} readOnly disabled />
    </div>
  );
}

function AddressPanel({ title, values, setters }: { title: string; values: string[]; setters: Array<(value: string) => void> }) {
  const labels = ["Address Line 1", "Address Line 2", "Address Line 3", "Address Line 4", "City", "Post Code", "Country"];
  return (
    <div className="rounded-[1.75rem] border border-white/10 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {values.map((value, index) => (
          <Input key={labels[index]} label={labels[index]} value={value} onChange={setters[index]} />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`mt-4 flex items-center justify-between gap-4 ${strong ? "text-lg font-bold text-white" : "text-white/75"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
