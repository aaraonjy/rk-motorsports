"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CustomerAccountNoFormat } from "@prisma/client";
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

type CustomerDeliveryAddress = {
  id: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  city: string | null;
  postCode: string | null;
  countryCode: string | null;
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
  deliveryAddresses?: CustomerDeliveryAddress[];
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
  accountConfiguration: {
    customerAccountPrefix: string;
    customerAccountNoFormat: CustomerAccountNoFormat;
  };
  existingCustomerAccountNos: string[];
  currentPage: number;
  pageSize: number;
};

type DeliveryAddressFormState = {
  id?: string;
  tempId: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  addressLine4: string;
  city: string;
  postCode: string;
  countryCode: string;
};

type CustomerFormState = {
  name: string;
  customerAccountNoSuffix: string;
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
  deliveryAddresses: DeliveryAddressFormState[];
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

function createTempId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapDeliveryAddress(address: CustomerDeliveryAddress): DeliveryAddressFormState {
  return {
    id: address.id,
    tempId: address.id || createTempId(),
    label: address.label || "",
    addressLine1: address.addressLine1 || "",
    addressLine2: address.addressLine2 || "",
    addressLine3: address.addressLine3 || "",
    addressLine4: address.addressLine4 || "",
    city: address.city || "",
    postCode: address.postCode || "",
    countryCode: address.countryCode || "MY",
  };
}

function getInitialForm(customer: CustomerRecord | null): CustomerFormState {
  const currentSuffix = customer?.customerAccountNo?.split("/")[1]?.slice(1) || "";

  return {
    name: customer?.name || "",
    customerAccountNoSuffix: currentSuffix,
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
    deliveryAddresses: (customer?.deliveryAddresses || []).map(mapDeliveryAddress),
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

function getAccountSuffixLength(format: CustomerAccountNoFormat) {
  switch (format) {
    case "XXXX_XXXXX":
      return 5;
    case "XXXX_XXX":
      return 3;
    case "XXX_XXXX":
    case "XXXX_XXXX":
    default:
      return 4;
  }
}

function getSequenceDigits(format: CustomerAccountNoFormat) {
  return Math.max(1, getAccountSuffixLength(format) - 1);
}

function getCustomerInitial(name: string) {
  const initial = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "X";
}

function getAccountPrefix(prefix: string) {
  return prefix.replace(/\/$/, "").toUpperCase();
}

function getNextAccountSuffix(args: {
  accountPrefix: string;
  initial: string;
  sequenceDigits: number;
  existingCustomerAccountNos: string[];
}) {
  if (!args.accountPrefix || !args.initial) return "";

  const matchPrefix = `${args.accountPrefix}/${args.initial}`;
  const nextSequence =
    args.existingCustomerAccountNos.reduce((max, accountNo) => {
      if (!accountNo.startsWith(matchPrefix)) return max;
      const sequence = Number(accountNo.slice(matchPrefix.length));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0) + 1;

  return `${args.initial}${String(nextSequence).padStart(args.sequenceDigits, "0")}`;
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
      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-10 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-14 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/25"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-white/55">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

function CustomerModal({
  isOpen,
  mode,
  customer,
  agents,
  accountConfiguration,
  existingCustomerAccountNos,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  mode: "create" | "edit";
  customer: CustomerRecord | null;
  agents: CustomerAgent[];
  accountConfiguration: Props["accountConfiguration"];
  existingCustomerAccountNos: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerFormState>(() => getInitialForm(customer));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountSuffixTouched, setAccountSuffixTouched] = useState(false);
  const [isAccountOverrideOpen, setIsAccountOverrideOpen] = useState(false);
  const [accountOverrideDraft, setAccountOverrideDraft] = useState("");
  const [isDeliveryAddressModalOpen, setIsDeliveryAddressModalOpen] = useState(false);
  const [deliveryAddressDraft, setDeliveryAddressDraft] = useState<DeliveryAddressFormState>({
    tempId: createTempId(),
    label: "",
    addressLine1: "",
    addressLine2: "",
    addressLine3: "",
    addressLine4: "",
    city: "",
    postCode: "",
    countryCode: "MY",
  });

  useMemo(() => {
    setForm(getInitialForm(customer));
    setAccountSuffixTouched(false);
    setIsAccountOverrideOpen(false);
    setAccountOverrideDraft("");
    setIsDeliveryAddressModalOpen(false);
    setDeliveryAddressDraft({
      tempId: createTempId(),
      label: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressLine4: "",
      city: "",
      postCode: "",
      countryCode: "MY",
    });
    setError(null);
    setIsSubmitting(false);
  }, [customer, isOpen]);

  const accountSuffixLength = getAccountSuffixLength(accountConfiguration.customerAccountNoFormat);
  const sequenceDigits = getSequenceDigits(accountConfiguration.customerAccountNoFormat);
  const accountPrefix = getAccountPrefix(accountConfiguration.customerAccountPrefix);
  const customerInitial = form.name.trim() ? getCustomerInitial(form.name) : "";
  const defaultAccountSuffix = useMemo(
    () =>
      getNextAccountSuffix({
        accountPrefix,
        initial: customerInitial,
        sequenceDigits,
        existingCustomerAccountNos,
      }),
    [accountPrefix, customerInitial, existingCustomerAccountNos, sequenceDigits]
  );
  const rawAccountSuffix = accountSuffixTouched ? form.customerAccountNoSuffix : defaultAccountSuffix;
  const accountSuffix = customerInitial && rawAccountSuffix ? rawAccountSuffix.toUpperCase().slice(0, accountSuffixLength) : "";
  const previewAccountNo = customerInitial && accountSuffix ? `${accountPrefix}/${accountSuffix}` : "";

  if (!isOpen) return null;

  const isPortalCustomer = customer?.accountSource === "PORTAL";

  function updateField<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "name" && mode === "create" ? { customerAccountNoSuffix: "" } : {}),
    }));

    if (key === "name" && mode === "create") {
      setAccountSuffixTouched(false);
    }
  }

  function updateDeliveryAddress(index: number, field: keyof DeliveryAddressFormState, value: string) {
    setForm((prev) => ({
      ...prev,
      deliveryAddresses: prev.deliveryAddresses.map((address, addressIndex) =>
        addressIndex === index ? { ...address, [field]: value } : address
      ),
    }));
  }

  function addDeliveryAddress() {
    setDeliveryAddressDraft({
      tempId: createTempId(),
      label: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressLine4: "",
      city: "",
      postCode: "",
      countryCode: form.deliveryCountryCode || "MY",
    });
    setIsDeliveryAddressModalOpen(true);
  }

  function updateDeliveryAddressDraft(field: keyof DeliveryAddressFormState, value: string) {
    setDeliveryAddressDraft((prev) => ({ ...prev, [field]: value }));
  }

  function saveDeliveryAddressDraft() {
    setForm((prev) => ({
      ...prev,
      deliveryAddresses: [...prev.deliveryAddresses, deliveryAddressDraft],
    }));
    setIsDeliveryAddressModalOpen(false);
  }

  function openAccountOverrideModal() {
    if (mode !== "create" || !customerInitial) return;
    setAccountOverrideDraft(accountSuffix || defaultAccountSuffix || "");
    setIsAccountOverrideOpen(true);
  }

  function saveAccountOverride() {
    const value = accountOverrideDraft.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, accountSuffixLength);
    setAccountSuffixTouched(true);
    updateField("customerAccountNoSuffix", value);
    setIsAccountOverrideOpen(false);
  }

  function removeDeliveryAddress(index: number) {
    setForm((prev) => ({
      ...prev,
      deliveryAddresses: prev.deliveryAddresses.filter((_, addressIndex) => addressIndex !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(mode === "create" ? "/api/admin/customers" : `/api/admin/customers/${customer?.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          customerAccountNo: mode === "create" ? previewAccountNo || null : customer?.customerAccountNo,
          email: form.email.trim(),
          phone: form.phone.trim(),
          agentId: form.agentId || null,
          deliveryAddresses: form.deliveryAddresses.map((address) => ({
            label: address.label.trim(),
            addressLine1: address.addressLine1.trim(),
            addressLine2: address.addressLine2.trim(),
            addressLine3: address.addressLine3.trim(),
            addressLine4: address.addressLine4.trim(),
            city: address.city.trim(),
            postCode: address.postCode.trim(),
            countryCode: address.countryCode || "MY",
          })),
        }),
      });

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
            <h3 className="text-lg font-semibold text-white">{mode === "create" ? "Add Customer" : "Edit Customer"}</h3>
            <p className="mt-1 text-sm text-white/50">
              {mode === "create" ? "Create a full customer profile for walk-in or admin-managed jobs." : "Update the customer profile details below."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Basic Info</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>A/C No.</FieldLabel>
                {mode === "create" ? (
                  <button
                    type="button"
                    onClick={openAccountOverrideModal}
                    disabled={!customerInitial}
                    className="flex w-full rounded-xl border border-white/10 bg-black/40 text-left text-sm text-white transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Click to override A/C No suffix"
                  >
                    <span className="flex w-1/2 items-center border-r border-white/10 px-4 text-white/50">
                      {accountPrefix}
                    </span>
                    <span className="flex w-1/2 min-w-0 items-center px-4 py-3 font-semibold text-white">
                      {accountSuffix}
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/70">{customer?.customerAccountNo || "-"}</div>
                )}
              </div>
              <div>
                <FieldLabel>Customer Name <span className="text-red-300">*</span></FieldLabel>
                <TextInput value={form.name} onChange={(value) => updateField("name", value)} required placeholder="Enter customer name" />
              </div>
              <div>
                <FieldLabel>Email <span className="text-red-300">*</span></FieldLabel>
                <TextInput type="email" value={form.email} onChange={(value) => updateField("email", value)} required disabled={mode === "edit" && isPortalCustomer} placeholder="Enter email address" />
                {mode === "edit" && isPortalCustomer ? <p className="mt-2 text-xs text-white/45">Email is locked for self-registered customers to avoid unexpected login issues.</p> : null}
              </div>
              <div>
                <FieldLabel>Phone 1</FieldLabel>
                <TextInput value={form.phone} onChange={(value) => updateField("phone", value)} placeholder="Enter phone number" />
              </div>
              <div>
                <FieldLabel>Phone 2</FieldLabel>
                <TextInput value={form.phone2} onChange={(value) => updateField("phone2", value)} placeholder="Enter secondary phone number" />
              </div>
              <div>
                <FieldLabel>Fax</FieldLabel>
                <TextInput value={form.fax} onChange={(value) => updateField("fax", value)} placeholder="Enter fax number" />
              </div>
              <div>
                <FieldLabel>Email CC</FieldLabel>
                <TextInput type="email" value={form.emailCc} onChange={(value) => updateField("emailCc", value)} placeholder="Enter CC email" />
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex min-h-[38px] items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Billing Address</div>
                <div className="h-9 w-9" aria-hidden="true" />
              </div>
              <div className="mt-4 space-y-4">
                {[1, 2, 3, 4].map((line) => {
                  const key = `billingAddressLine${line}` as keyof CustomerFormState;
                  return <TextInput key={key} value={String(form[key] || "")} onChange={(value) => updateField(key, value)} placeholder={`Billing address line ${line}`} />;
                })}
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput value={form.billingCity} onChange={(value) => updateField("billingCity", value)} placeholder="City" />
                  <TextInput value={form.billingPostCode} onChange={(value) => updateField("billingPostCode", value)} placeholder="Post Code" />
                </div>
                <SelectInput value={form.billingCountryCode} onChange={(value) => updateField("billingCountryCode", value)}>
                  {SEA_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.code} - {country.name}</option>)}
                </SelectInput>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex min-h-[38px] items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Default Delivery Address</div>
                <button type="button" onClick={addDeliveryAddress} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-lg text-white/70 transition hover:bg-white/10 hover:text-white" title="Add secondary delivery address">+</button>
              </div>
              <div className="mt-4 space-y-4">
                {[1, 2, 3, 4].map((line) => {
                  const key = `deliveryAddressLine${line}` as keyof CustomerFormState;
                  return <TextInput key={key} value={String(form[key] || "")} onChange={(value) => updateField(key, value)} placeholder={`Delivery address line ${line}`} />;
                })}
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput value={form.deliveryCity} onChange={(value) => updateField("deliveryCity", value)} placeholder="City" />
                  <TextInput value={form.deliveryPostCode} onChange={(value) => updateField("deliveryPostCode", value)} placeholder="Post Code" />
                </div>
                <SelectInput value={form.deliveryCountryCode} onChange={(value) => updateField("deliveryCountryCode", value)}>
                  {SEA_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.code} - {country.name}</option>)}
                </SelectInput>
              </div>
            </div>
          </div>

          {form.deliveryAddresses.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Secondary Delivery Addresses</div>
                <button type="button" onClick={addDeliveryAddress} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">+ Add Address</button>
              </div>
              <div className="mt-4 space-y-3">
                {form.deliveryAddresses.map((address, index) => (
                  <div key={address.tempId} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="min-w-0 text-sm text-white/70">
                      <div className="font-semibold text-white">{address.label || `Address ${index + 1}`}</div>
                      <div className="mt-1 break-words">
                        {[address.addressLine1, address.addressLine2, address.addressLine3, address.addressLine4, address.postCode, address.city, address.countryCode]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </div>
                    </div>
                    <button type="button" onClick={() => removeDeliveryAddress(index)} className="shrink-0 rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Business Info</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><FieldLabel>Area</FieldLabel><TextInput value={form.area} onChange={(value) => updateField("area", value)} placeholder="Enter area" /></div>
              <div>
                <FieldLabel>Currency</FieldLabel>
                <SelectInput value={form.currency} onChange={(value) => updateField("currency", value)}>
                  {CUSTOMER_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} - {currency.name}</option>)}
                </SelectInput>
              </div>
              <div>
                <FieldLabel>Agent</FieldLabel>
                <SelectInput value={form.agentId} onChange={(value) => updateField("agentId", value)}>
                  <option value="">No Agent</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.code} - {agent.name}</option>)}
                </SelectInput>
              </div>
              <div><FieldLabel>Nature of Business</FieldLabel><TextInput value={form.natureOfBusiness} onChange={(value) => updateField("natureOfBusiness", value)} placeholder="Enter nature of business" /></div>
              <div><FieldLabel>Attention</FieldLabel><TextInput value={form.attention} onChange={(value) => updateField("attention", value)} placeholder="Enter attention" /></div>
              <div><FieldLabel>Contact</FieldLabel><TextInput value={form.contactPerson} onChange={(value) => updateField("contactPerson", value)} placeholder="Enter contact person" /></div>
              <div>
                <FieldLabel>Registration Type</FieldLabel>
                <SelectInput value={form.registrationIdType} onChange={(value) => updateField("registrationIdType", value)}>
                  {CUSTOMER_REGISTRATION_ID_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </SelectInput>
              </div>
              <div><FieldLabel>Business Registration No.</FieldLabel><TextInput value={form.registrationNo} onChange={(value) => updateField("registrationNo", value)} placeholder="Enter registration no." /></div>
              <div><FieldLabel>Tax Identification No.</FieldLabel><TextInput value={form.taxIdentificationNo} onChange={(value) => updateField("taxIdentificationNo", value)} placeholder="Enter TIN no." /></div>
            </div>
          </div>

          {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">Save Failed</div><p className="mt-2 leading-6">{error}</p></div> : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? (mode === "create" ? "Creating..." : "Saving...") : mode === "create" ? "Add Customer" : "Save Changes"}
            </button>
          </div>
        </form>

        {isAccountOverrideOpen ? (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4">
            <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Customer A/C No</p>
              <h3 className="mt-3 text-2xl font-bold text-white">Override A/C No</h3>
              <p className="mt-3 text-sm leading-6 text-white/60">
                Only the right side suffix can be changed. Prefix is locked by account configuration.
              </p>

              <div className="mt-5">
                <FieldLabel>Auto Generated Preview</FieldLabel>
                <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white">
                  {previewAccountNo || "-"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div>
                  <FieldLabel>Locked Prefix</FieldLabel>
                  <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/60">
                    {accountPrefix}
                  </div>
                </div>
                <div>
                  <FieldLabel>Editable Suffix</FieldLabel>
                  <input
                    type="text"
                    value={accountOverrideDraft}
                    onChange={(e) => setAccountOverrideDraft(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, accountSuffixLength))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
                    placeholder={`${customerInitial || "A"}${"0".repeat(sequenceDigits)}`}
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsAccountOverrideOpen(false)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">
                  Cancel
                </button>
                <button type="button" onClick={saveAccountOverride} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400">
                  OK
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isDeliveryAddressModalOpen ? (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4 py-6">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">Delivery Address</p>
              <h3 className="mt-3 text-2xl font-bold text-white">Add Secondary Address</h3>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <TextInput value={deliveryAddressDraft.label} onChange={(value) => updateDeliveryAddressDraft("label", value)} placeholder="Label / Branch name" />
                <TextInput value={deliveryAddressDraft.addressLine1} onChange={(value) => updateDeliveryAddressDraft("addressLine1", value)} placeholder="Address line 1" />
                <TextInput value={deliveryAddressDraft.addressLine2} onChange={(value) => updateDeliveryAddressDraft("addressLine2", value)} placeholder="Address line 2" />
                <TextInput value={deliveryAddressDraft.addressLine3} onChange={(value) => updateDeliveryAddressDraft("addressLine3", value)} placeholder="Address line 3" />
                <TextInput value={deliveryAddressDraft.addressLine4} onChange={(value) => updateDeliveryAddressDraft("addressLine4", value)} placeholder="Address line 4" />
                <TextInput value={deliveryAddressDraft.city} onChange={(value) => updateDeliveryAddressDraft("city", value)} placeholder="City" />
                <TextInput value={deliveryAddressDraft.postCode} onChange={(value) => updateDeliveryAddressDraft("postCode", value)} placeholder="Post Code" />
                <SelectInput value={deliveryAddressDraft.countryCode} onChange={(value) => updateDeliveryAddressDraft("countryCode", value)}>
                  {SEA_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.code} - {country.name}</option>)}
                </SelectInput>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsDeliveryAddressModalOpen(false)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">
                  Cancel
                </button>
                <button type="button" onClick={saveDeliveryAddressDraft} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400">
                  Save Address
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}

function TempPasswordModal({ password, onClose }: { password: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!password) return null;

  async function handleCopy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Portal Access Enabled</h3>
        <p className="mt-2 text-sm leading-6 text-white/60">The customer can now log in to the portal using this temporary password. Please save it now because it will not be shown again.</p>
        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Temporary Password</div>
          <div className="mt-2 break-all text-lg font-semibold text-white">{password}</div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={handleCopy} className={`rounded-xl border px-4 py-2.5 text-sm transition ${copied ? "border-emerald-400 bg-emerald-400/10 text-emerald-300" : "border-white/15 text-white/80 hover:bg-white/10"}`}>{copied ? "Copied ✓" : "Copy Password"}</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:bg-white/10">Close</button>
        </div>
      </div>
    </div>
  );
}

function PortalAccessConfirmModal({ customer, isSubmitting, onClose, onConfirm }: { customer: CustomerRecord | null; isSubmitting: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!customer) return null;
  const isEnabling = !customer.portalAccess;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">{isEnabling ? "Enable Portal Access" : "Disable Portal Access"}</h3>
        <p className="mt-2 text-sm leading-6 text-white/60">
          {isEnabling ? `Are you sure you want to enable portal access for ${customer.name}? A new temporary password will be generated immediately.` : `Are you sure you want to disable portal access for ${customer.name}? They will no longer be able to log in to the portal.`}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">No</button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting} className={`rounded-xl border px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${isEnabling ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" : "border-red-500/40 text-red-300 hover:bg-red-500/10"}`}>{isSubmitting ? "Updating..." : "Yes"}</button>
        </div>
      </div>
    </div>
  );
}

export function AdminCustomerManagement({ customers, agents, accountConfiguration, existingCustomerAccountNos, currentPage, pageSize }: Props) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [portalAccessTarget, setPortalAccessTarget] = useState<CustomerRecord | null>(null);

  async function togglePortalAccess(userId: string) {
    try {
      setIsTogglingId(userId);
      const response = await fetch(`/api/admin/customers/${userId}/portal-access`, { method: "PATCH" });
      const data = (await response.json()) as CustomerApiResponse;
      if (!response.ok || !data.ok) {
        alert(data.error || "Failed to update portal access.");
        return;
      }
      if (data.tempPassword) setTempPassword(data.tempPassword);
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
        <button type="button" onClick={() => setIsCreateOpen(true)} className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10">Add Customer</button>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/20 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-md">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-black/50 text-white/65">
            <tr>
              <th className="w-[70px] px-4 py-4">No.</th>
              <th className="w-[220px] px-4 py-4">Customer</th>
              <th className="w-[150px] px-4 py-4">A/C No.</th>
              <th className="w-[180px] px-4 py-4">Phone</th>
              <th className="w-[260px] px-4 py-4">Email</th>
              <th className="w-[150px] px-4 py-4">Source</th>
              <th className="w-[140px] px-4 py-4">Portal Access</th>
              <th className="w-[110px] px-4 py-4">Orders</th>
              <th className="w-[160px] px-4 py-4">Created Date</th>
              <th className="w-[200px] px-4 py-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.length > 0 ? customers.map((customer, index) => (
              <tr key={customer.id} onClick={() => handleRowClick(customer.id)} className="cursor-pointer border-t border-white/10 align-top transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-4 text-white/55">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="px-4 py-4"><div className="break-words font-semibold text-white/90">{customer.name}</div></td>
                <td className="break-words px-4 py-4 text-white/85">{customer.customerAccountNo || "-"}</td>
                <td className="break-words px-4 py-4 text-white/85">{customer.phone || "-"}</td>
                <td className="break-words px-4 py-4 text-white/85">{customer.email}</td>
                <td className="px-4 py-4"><span className={getSourceBadge(customer.accountSource)}>{getSourceLabel(customer.accountSource)}</span></td>
                <td className="px-4 py-4">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setPortalAccessTarget(customer); }} disabled={isTogglingId === customer.id} className={getPortalAccessBadge(customer.portalAccess)}>
                    {isTogglingId === customer.id ? "Updating..." : customer.portalAccess ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-4 text-white/85">{customer._count.orders}</td>
                <td className="px-4 py-4 text-white/65"><div>{new Date(customer.createdAt).toLocaleDateString()}</div><div className="text-xs text-white/35">{new Date(customer.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}</div></td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-2">
                    <Link href={`/admin/customers/${customer.id}/create-order`} onClick={(e) => e.stopPropagation()} className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-center text-white transition hover:bg-white/10">Create Order</Link>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCustomer(customer); }} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-white transition hover:bg-white/10">Edit</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-white/45">No customers found for the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CustomerModal isOpen={isCreateOpen} mode="create" customer={null} agents={agents} accountConfiguration={accountConfiguration} existingCustomerAccountNos={existingCustomerAccountNos} onClose={() => setIsCreateOpen(false)} onSaved={handleSaved} />
      <CustomerModal isOpen={editingCustomer !== null} mode="edit" customer={editingCustomer} agents={agents} accountConfiguration={accountConfiguration} existingCustomerAccountNos={existingCustomerAccountNos} onClose={() => setEditingCustomer(null)} onSaved={handleSaved} />
      <PortalAccessConfirmModal customer={portalAccessTarget} isSubmitting={!!(portalAccessTarget && isTogglingId === portalAccessTarget.id)} onClose={() => setPortalAccessTarget(null)} onConfirm={handleConfirmPortalAccess} />
      <TempPasswordModal password={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}
