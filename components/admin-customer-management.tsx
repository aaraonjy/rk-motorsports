"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CUSTOMER_CURRENCIES,
  CUSTOMER_REGISTRATION_ID_TYPES,
  SEA_COUNTRIES,
} from "@/lib/customer-profile-options";

type CustomerAgent = {
  id: string;
  code: string;
  name: string;
};

type CustomerRecord = {
  id: string;
  name: string;
  customerAccountNo: string | null;
  email: string;
  phone: string | null;
  phone2: string | null;
  fax: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingAddressLine3: string | null;
  billingAddressLine4: string | null;
  billingCity: string | null;
  billingPostCode: string | null;
  billingCountryCode: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryAddressLine3: string | null;
  deliveryAddressLine4: string | null;
  deliveryCity: string | null;
  deliveryPostCode: string | null;
  deliveryCountryCode: string | null;
  area: string | null;
  attention: string | null;
  contactPerson: string | null;
  emailCc: string | null;
  currency: string;
  agentId: string | null;
  agent: CustomerAgent | null;
  natureOfBusiness: string | null;
  registrationIdType: string | null;
  registrationNo: string | null;
  taxIdentificationNo: string | null;
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  createdAt: string;
  _count: {
    orders: number;
  };
};

type Props = {
  customers: CustomerRecord[];
  agents: CustomerAgent[];
  currentPage: number;
  pageSize: number;
};

type CustomerFormState = {
  name: string;
  email: string;
  phone: string;
  phone2: string;
  fax: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingAddressLine3: string;
  billingAddressLine4: string;
  billingCity: string;
  billingPostCode: string;
  billingCountryCode: string;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string;
  deliveryAddressLine3: string;
  deliveryAddressLine4: string;
  deliveryCity: string;
  deliveryPostCode: string;
  deliveryCountryCode: string;
  area: string;
  attention: string;
  contactPerson: string;
  emailCc: string;
  currency: string;
  agentId: string;
  natureOfBusiness: string;
  registrationIdType: string;
  registrationNo: string;
  taxIdentificationNo: string;
};

type CustomerApiResponse = {
  ok?: boolean;
  error?: string;
  tempPassword?: string;
};

function getInitialForm(customer: CustomerRecord | null): CustomerFormState {
  return {
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    phone2: customer?.phone2 || "",
    fax: customer?.fax || "",
    billingAddressLine1: customer?.billingAddressLine1 || "",
    billingAddressLine2: customer?.billingAddressLine2 || "",
    billingAddressLine3: customer?.billingAddressLine3 || "",
    billingAddressLine4: customer?.billingAddressLine4 || "",
    billingCity: customer?.billingCity || "",
    billingPostCode: customer?.billingPostCode || "",
    billingCountryCode: customer?.billingCountryCode || "MY",
    deliveryAddressLine1: customer?.deliveryAddressLine1 || "",
    deliveryAddressLine2: customer?.deliveryAddressLine2 || "",
    deliveryAddressLine3: customer?.deliveryAddressLine3 || "",
    deliveryAddressLine4: customer?.deliveryAddressLine4 || "",
    deliveryCity: customer?.deliveryCity || "",
    deliveryPostCode: customer?.deliveryPostCode || "",
    deliveryCountryCode: customer?.deliveryCountryCode || "MY",
    area: customer?.area || "",
    attention: customer?.attention || "",
    contactPerson: customer?.contactPerson || "",
    emailCc: customer?.emailCc || "",
    currency: customer?.currency || "MYR",
    agentId: customer?.agentId || "",
    natureOfBusiness: customer?.natureOfBusiness || "",
    registrationIdType: customer?.registrationIdType || "BRN",
    registrationNo: customer?.registrationNo || "",
    taxIdentificationNo: customer?.taxIdentificationNo || "",
  };
}

function getSourceBadge(source: "PORTAL" | "ADMIN") {
  return source === "ADMIN"
    ? "inline-flex min-w-[110px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-300"
    : "inline-flex min-w-[110px] items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-center text-xs font-semibold text-sky-300";
}

function getSourceLabel(source: "PORTAL" | "ADMIN") {
  return source === "ADMIN" ? "Admin Created" : "Self Registered";
}

function getPortalAccessBadge(enabled: boolean) {
  return enabled
    ? "inline-flex min-w-[88px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
    : "inline-flex min-w-[88px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/75 transition hover:bg-white/15";
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm text-white/70">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function CustomerModal({
  isOpen,
  mode,
  customer,
  agents,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  mode: "create" | "edit";
  customer: CustomerRecord | null;
  agents: CustomerAgent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerFormState>(() => getInitialForm(customer));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useMemo(() => {
    setForm(getInitialForm(customer));
    setError(null);
    setIsSubmitting(false);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const isPortalCustomer = customer?.accountSource === "PORTAL";

  function updateField<K extends keyof CustomerFormState>(
    key: K,
    value: CustomerFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        mode === "create" ? "/api/admin/customers" : `/api/admin/customers/${customer?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            agentId: form.agentId || null,
          }),
        }
      );

      const data = (await response.json()) as CustomerApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to save customer right now.");
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Unable to save customer right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {mode === "create" ? "Add Customer" : "Edit Customer"}
            </h3>
            <p className="mt-1 text-sm text-white/50">
              {mode === "create"
                ? "Create a full customer profile for walk-in or admin-managed jobs."
                : "Update the customer profile details below."}
            </p>
          </div>
        </div>

        {mode === "edit" && customer?.customerAccountNo ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
            <span className="text-white/45">A/C No.:</span>{" "}
            <span className="font-semibold text-white">{customer.customerAccountNo}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
              Basic Info
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Customer Name</FieldLabel>
                <TextInput
                  value={form.name}
                  onChange={(value) => updateField("name", value)}
                  required
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <FieldLabel>
                  Email <span className="text-white/40">(required)</span>
                </FieldLabel>
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(value) => updateField("email", value)}
                  required
                  disabled={mode === "edit" && isPortalCustomer}
                  placeholder="Enter email address"
                />
                {mode === "edit" && isPortalCustomer ? (
                  <p className="mt-2 text-xs text-white/45">
                    Email is locked for self-registered customers to avoid unexpected login issues.
                  </p>
                ) : null}
              </div>
              <div>
                <FieldLabel>Phone 1</FieldLabel>
                <TextInput
                  value={form.phone}
                  onChange={(value) => updateField("phone", value)}
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <FieldLabel>Phone 2</FieldLabel>
                <TextInput
                  value={form.phone2}
                  onChange={(value) => updateField("phone2", value)}
                  placeholder="Enter secondary phone number"
                />
              </div>
              <div>
                <FieldLabel>Fax</FieldLabel>
                <TextInput
                  value={form.fax}
                  onChange={(value) => updateField("fax", value)}
                  placeholder="Enter fax number"
                />
              </div>
              <div>
                <FieldLabel>Email CC</FieldLabel>
                <TextInput
                  type="email"
                  value={form.emailCc}
                  onChange={(value) => updateField("emailCc", value)}
                  placeholder="Enter CC email"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
                Billing Address
              </div>
              <div className="mt-4 space-y-4">
                {[1, 2, 3, 4].map((line) => {
                  const key = `billingAddressLine${line}` as keyof CustomerFormState;
                  return (
                    <TextInput
                      key={key}
                      value={String(form[key] || "")}
                      onChange={(value) => updateField(key, value)}
                      placeholder={`Billing address line ${line}`}
                    />
                  );
                })}
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput
                    value={form.billingCity}
                    onChange={(value) => updateField("billingCity", value)}
                    placeholder="City"
                  />
                  <TextInput
                    value={form.billingPostCode}
                    onChange={(value) => updateField("billingPostCode", value)}
                    placeholder="Post Code"
                  />
                </div>
                <select
                  value={form.billingCountryCode}
                  onChange={(e) => updateField("billingCountryCode", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
                >
                  {SEA_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.code} - {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
                Default Delivery Address
              </div>
              <div className="mt-4 space-y-4">
                {[1, 2, 3, 4].map((line) => {
                  const key = `deliveryAddressLine${line}` as keyof CustomerFormState;
                  return (
                    <TextInput
                      key={key}
                      value={String(form[key] || "")}
                      onChange={(value) => updateField(key, value)}
                      placeholder={`Delivery address line ${line}`}
                    />
                  );
                })}
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput
                    value={form.deliveryCity}
                    onChange={(value) => updateField("deliveryCity", value)}
                    placeholder="City"
                  />
                  <TextInput
                    value={form.deliveryPostCode}
                    onChange={(value) => updateField("deliveryPostCode", value)}
                    placeholder="Post Code"
                  />
                </div>
                <select
                  value={form.deliveryCountryCode}
                  onChange={(e) => updateField("deliveryCountryCode", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
                >
                  {SEA_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.code} - {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
              Business Info
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Area</FieldLabel>
                <TextInput
                  value={form.area}
                  onChange={(value) => updateField("area", value)}
                  placeholder="Enter area"
                />
              </div>
              <div>
                <FieldLabel>Currency</FieldLabel>
                <select
                  value={form.currency}
                  onChange={(e) => updateField("currency", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
                >
                  {CUSTOMER_CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Agent</FieldLabel>
                <select
                  value={form.agentId}
                  onChange={(e) => updateField("agentId", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="">No Agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.code} - {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Nature of Business</FieldLabel>
                <TextInput
                  value={form.natureOfBusiness}
                  onChange={(value) => updateField("natureOfBusiness", value)}
                  placeholder="Enter nature of business"
                />
              </div>
              <div>
                <FieldLabel>Attention</FieldLabel>
                <TextInput
                  value={form.attention}
                  onChange={(value) => updateField("attention", value)}
                  placeholder="Enter attention"
                />
              </div>
              <div>
                <FieldLabel>Contact</FieldLabel>
                <TextInput
                  value={form.contactPerson}
                  onChange={(value) => updateField("contactPerson", value)}
                  placeholder="Enter contact person"
                />
              </div>
              <div>
                <FieldLabel>Registration Type</FieldLabel>
                <select
                  value={form.registrationIdType}
                  onChange={(e) => updateField("registrationIdType", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
                >
                  {CUSTOMER_REGISTRATION_ID_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Business Registration No.</FieldLabel>
                <TextInput
                  value={form.registrationNo}
                  onChange={(value) => updateField("registrationNo", value)}
                  placeholder="Enter registration no."
                />
              </div>
              <div>
                <FieldLabel>Tax Identification No.</FieldLabel>
                <TextInput
                  value={form.taxIdentificationNo}
                  onChange={(value) => updateField("taxIdentificationNo", value)}
                  placeholder="Enter TIN no."
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">
                Save Failed
              </div>
              <p className="mt-2 leading-6">{error}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Add Customer"
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TempPasswordModal({
  password,
  onClose,
}: {
  password: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!password) return null;

  async function handleCopy() {
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Portal Access Enabled</h3>
        <p className="mt-2 text-sm leading-6 text-white/60">
          The customer can now log in to the portal using this temporary password.
          Please save it now because it will not be shown again.
        </p>

        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Temporary Password
          </div>
          <div className="mt-2 break-all text-lg font-semibold text-white">{password}</div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!password}
            className={`rounded-xl border px-4 py-2.5 text-sm transition ${
              copied
                ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                : "border-white/15 text-white/80 hover:bg-white/10"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {copied ? "Copied ✓" : "Copy Password"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {copied ? (
          <p className="mt-3 text-sm text-emerald-300">
            Password copied to clipboard.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PortalAccessConfirmModal({
  customer,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  customer: CustomerRecord | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!customer) return null;

  const isEnabling = !customer.portalAccess;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {isEnabling ? "Enable Portal Access" : "Disable Portal Access"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {isEnabling
              ? `Are you sure you want to enable portal access for ${customer.name}? A new temporary password will be generated immediately.`
              : `Are you sure you want to disable portal access for ${customer.name}? They will no longer be able to log in to the portal.`}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            No
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`rounded-xl border px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isEnabling
                ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                : "border-red-500/40 text-red-300 hover:bg-red-500/10"
            }`}
          >
            {isSubmitting ? "Updating..." : "Yes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminCustomerManagement({ customers, agents, currentPage, pageSize }: Props) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [portalAccessTarget, setPortalAccessTarget] = useState<CustomerRecord | null>(null);

  async function togglePortalAccess(userId: string) {
    try {
      setIsTogglingId(userId);
      const response = await fetch(`/api/admin/customers/${userId}/portal-access`, {
        method: "PATCH",
      });

      const data = (await response.json()) as CustomerApiResponse;

      if (!response.ok || !data.ok) {
        alert(data.error || "Failed to update portal access.");
        return;
      }

      if (data.tempPassword) {
        setTempPassword(data.tempPassword);
      }

      router.refresh();
    } catch {
      alert("Failed to update portal access.");
    } finally {
      setIsTogglingId(null);
    }
  }

  async function handleConfirmPortalAccess() {
    if (!portalAccessTarget) return;

    const userId = portalAccessTarget.id;
    setPortalAccessTarget(null);
    await togglePortalAccess(userId);
  }

  function handleSaved() {
    router.refresh();
  }

  function handleRowClick(customerId: string) {
    router.push(`/admin/customers/${customerId}`);
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10"
        >
          Add Customer
        </button>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/20 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-md">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-black/50 text-white/65">
            <tr>
              <th className="px-4 py-4 w-[70px]">No.</th>
              <th className="px-4 py-4 w-[220px]">Customer</th>
              <th className="px-4 py-4 w-[150px]">A/C No.</th>
              <th className="px-4 py-4 w-[180px]">Phone</th>
              <th className="px-4 py-4 w-[260px]">Email</th>
              <th className="px-4 py-4 w-[150px]">Agent</th>
              <th className="px-4 py-4 w-[150px]">Source</th>
              <th className="px-4 py-4 w-[140px]">Portal Access</th>
              <th className="px-4 py-4 w-[110px]">Orders</th>
              <th className="px-4 py-4 w-[160px]">Created Date</th>
              <th className="px-4 py-4 w-[200px]">Action</th>
            </tr>
          </thead>

          <tbody>
            {customers.length > 0 ? (
              customers.map((customer, index) => (
                <tr
                  key={customer.id}
                  onClick={() => handleRowClick(customer.id)}
                  className="cursor-pointer border-t border-white/10 align-top transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-4 text-white/55">
                    {(currentPage - 1) * pageSize + index + 1}
                  </td>

                  <td className="px-4 py-4">
                    <div className="font-semibold break-words text-white/90">
                      {customer.name}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-white/85 break-words">
                    {customer.customerAccountNo || "-"}
                  </td>

                  <td className="px-4 py-4 text-white/85 break-words">{customer.phone || "-"}</td>

                  <td className="px-4 py-4 text-white/85 break-words">{customer.email}</td>

                  <td className="px-4 py-4 text-white/85 break-words">
                    {customer.agent ? customer.agent.name : "-"}
                  </td>

                  <td className="px-4 py-4">
                    <span className={getSourceBadge(customer.accountSource)}>
                      {getSourceLabel(customer.accountSource)}
                    </span>
                  </td>

                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPortalAccessTarget(customer);
                      }}
                      disabled={isTogglingId === customer.id}
                      className={getPortalAccessBadge(customer.portalAccess)}
                    >
                      {isTogglingId === customer.id
                        ? "Updating..."
                        : customer.portalAccess
                          ? "Enabled"
                          : "Disabled"}
                    </button>
                  </td>

                  <td className="px-4 py-4 text-white/85">{customer._count.orders}</td>

                  <td className="px-4 py-4 text-white/65">
                    <div>{new Date(customer.createdAt).toLocaleDateString()}</div>
                    <div className="text-xs text-white/35">
                      {new Date(customer.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/admin/customers/${customer.id}/create-order`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-center text-white transition hover:bg-white/10"
                      >
                        Create Order
                      </Link>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCustomer(customer);
                        }}
                        className="rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-white transition hover:bg-white/10"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-white/45">
                  No customers found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CustomerModal
        isOpen={isCreateOpen}
        mode="create"
        customer={null}
        agents={agents}
        onClose={() => setIsCreateOpen(false)}
        onSaved={handleSaved}
      />

      <CustomerModal
        isOpen={editingCustomer !== null}
        mode="edit"
        customer={editingCustomer}
        agents={agents}
        onClose={() => setEditingCustomer(null)}
        onSaved={handleSaved}
      />

      <PortalAccessConfirmModal
        customer={portalAccessTarget}
        isSubmitting={!!(portalAccessTarget && isTogglingId === portalAccessTarget.id)}
        onClose={() => setPortalAccessTarget(null)}
        onConfirm={handleConfirmPortalAccess}
      />

      <TempPasswordModal password={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}
