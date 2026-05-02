"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CustomerAccountNoFormat } from "@prisma/client";
import { CUSTOMER_REGISTRATION_ID_TYPES } from "@/lib/customer-profile-options";

type CustomerAgent = {
  id: string;
  code: string;
  name: string;
};

type CountryOption = {
  id: string;
  code: string;
  name: string;
};

type CurrencyOption = {
  id: string;
  code: string;
  name: string;
  symbol: string;
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
  creditTermsDays: number;
  creditLimitAmount: string | number;
  creditOutstandingAmount?: number;
  creditOverdueAmount?: number;
  creditOldestOverdueDays?: number;
  creditLimitExceeded?: boolean;
  creditOverdue?: boolean;
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  isActive: boolean;
  createdAt: string;
  _count: {
    orders: number;
    customerSalesTransactions?: number;
    creditNotes?: number;
  };
  salesTransactionOrderCount?: number;
  customerProfileTransactionCount?: number;
};

type Props = {
  customers: CustomerRecord[];
  agents: CustomerAgent[];
  countries: CountryOption[];
  currencies: CurrencyOption[];
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
  creditControlType: "NONE" | "TERMS" | "LIMIT";
  creditTermsDays: string;
  creditLimitAmount: string;
  isActive: boolean;
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
    creditControlType: Number(customer?.creditTermsDays ?? 0) > 0 ? "TERMS" : Number(customer?.creditLimitAmount ?? 0) > 0 ? "LIMIT" : "NONE",
    creditTermsDays: String(customer?.creditTermsDays ?? 0),
    creditLimitAmount: String(customer?.creditLimitAmount ?? 0),
    isActive: customer?.isActive ?? true,
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

function getCustomerStatusBadge(isActive: boolean) {
  return isActive
    ? "inline-flex min-w-[88px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300"
    : "inline-flex min-w-[88px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
}

function getCustomerStatusLabel(isActive: boolean) {
  return isActive ? "Active" : "Inactive";
}

function getCreditBadge(customer: CustomerRecord) {
  if (customer.creditOverdue) {
    return "inline-flex min-w-[120px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-center text-xs font-semibold text-red-300";
  }
  if (customer.creditLimitExceeded) {
    return "inline-flex min-w-[120px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-300";
  }
  return "inline-flex min-w-[120px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300";
}

function getCreditLabel(customer: CustomerRecord) {
  if (customer.creditOverdue) return "Overdue";
  if (customer.creditLimitExceeded) return "Over Limit";
  return "OK";
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  min,
  step,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      min={min}
      step={step}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-10 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

type SearchableSelectOption = {
  id: string;
  label: string;
  searchText: string;
};

function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: SearchableSelectOption[];
  value: string;
  disabled?: boolean;
  onChange: (option: SearchableSelectOption | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(() => options.find((item) => item.id === value) || null, [options, value]);

  useEffect(() => {
    setSearch(selectedOption?.label || "");
  }, [selectedOption?.label]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((item) => item.searchText.includes(keyword));
  }, [options, search]);

  return (
    <div ref={containerRef} className="relative">
      <label className="label-rk">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
          setSearch("");
        }}
        className={`input-rk flex items-center justify-between gap-3 pr-20 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span className={selectedOption ? "truncate text-white" : "truncate text-white/45"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="shrink-0 pr-5 text-white/60">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[140] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
          <div className="border-b border-white/10 p-3">
            <input
              autoFocus
              className="input-rk"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
            />
          </div>

          <div className="max-h-56 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-sm text-white/45">No matching {label.toLowerCase()} found.</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedOption?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option);
                      setSearch(option.label);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-sm transition ${
                      isSelected ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CustomerModal({
  isOpen,
  mode,
  customer,
  agents,
  countries,
  currencies,
  accountConfiguration,
  existingCustomerAccountNos,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  mode: "create" | "edit";
  customer: CustomerRecord | null;
  agents: CustomerAgent[];
  countries: CountryOption[];
  currencies: CurrencyOption[];
  accountConfiguration: Props["accountConfiguration"];
  existingCustomerAccountNos: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<CustomerFormState>(() => getInitialForm(customer));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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
    setIsDeleting(false);
    setIsDeleteConfirmOpen(false);
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

  const countryList = useMemo(
    () => (countries.length > 0 ? countries : [{ id: "fallback-MY", code: "MY", name: "Malaysia" }]),
    [countries]
  );

  const currencyList = useMemo(
    () => (currencies.length > 0 ? currencies : [{ id: "fallback-MYR", code: "MYR", name: "Malaysian Ringgit", symbol: "RM" }]),
    [currencies]
  );

  const countryOptions = useMemo<SearchableSelectOption[]>(() => {
    const options = countryList.map((country) => ({
      id: country.code,
      label: `${country.code} — ${country.name}`,
      searchText: `${country.code} ${country.name}`.toLowerCase(),
    }));

    const currentValues = [form.billingCountryCode, form.deliveryCountryCode, deliveryAddressDraft.countryCode]
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean);

    for (const currentValue of currentValues) {
      if (!options.some((option) => option.id === currentValue)) {
        options.unshift({ id: currentValue, label: currentValue, searchText: currentValue.toLowerCase() });
      }
    }

    return options;
  }, [countryList, deliveryAddressDraft.countryCode, form.billingCountryCode, form.deliveryCountryCode]);

  const currencyOptions = useMemo<SearchableSelectOption[]>(() => {
    const options = currencyList.map((currency) => ({
      id: currency.code,
      label: `${currency.code} — ${currency.name}${currency.symbol ? ` (${currency.symbol})` : ""}`,
      searchText: `${currency.code} ${currency.name} ${currency.symbol || ""}`.toLowerCase(),
    }));

    const currentValue = String(form.currency || "").trim().toUpperCase();
    if (currentValue && !options.some((option) => option.id === currentValue)) {
      options.unshift({ id: currentValue, label: currentValue, searchText: currentValue.toLowerCase() });
    }

    return options;
  }, [currencyList, form.currency]);

  const agentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "", label: "No Agent", searchText: "no agent" },
      ...agents.map((agent) => ({
        id: agent.id,
        label: `${agent.code} — ${agent.name}`,
        searchText: `${agent.code} ${agent.name}`.toLowerCase(),
      })),
    ],
    [agents]
  );

  const registrationTypeOptions = useMemo<SearchableSelectOption[]>(
    () =>
      CUSTOMER_REGISTRATION_ID_TYPES.map((item) => ({
        id: item.value,
        label: item.label,
        searchText: `${item.value} ${item.label}`.toLowerCase(),
      })),
    []
  );

  const creditControlOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { id: "NONE", label: "None", searchText: "none no credit control" },
      { id: "TERMS", label: "Credit Terms", searchText: "credit terms days overdue" },
      { id: "LIMIT", label: "Credit Limit", searchText: "credit limit amount over limit" },
    ],
    []
  );

  const selectedCurrencyCode = String(form.currency || "MYR").trim().toUpperCase() || "MYR";

  if (!isOpen) return null;

  const isPortalCustomer = customer?.accountSource === "PORTAL";
  const canDeleteCustomer = mode === "edit" && customer ? Number(customer.customerProfileTransactionCount ?? customer._count.orders ?? 0) === 0 : false;

  function updateField<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
        ...(key === "name" && mode === "create" ? { customerAccountNoSuffix: "" } : {}),
      };

      if (key === "creditControlType") {
        if (value === "NONE") {
          next.creditTermsDays = "0";
          next.creditLimitAmount = "0";
        }
        if (value === "TERMS") {
          next.creditLimitAmount = "0";
        }
        if (value === "LIMIT") {
          next.creditTermsDays = "0";
        }
      }

      return next;
    });

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
          creditTermsDays: form.creditControlType === "TERMS" ? form.creditTermsDays : "0",
          creditLimitAmount: form.creditControlType === "LIMIT" ? form.creditLimitAmount : "0",
          name: form.name.trim(),
          customerAccountNo: mode === "create" ? previewAccountNo || null : customer?.customerAccountNo,
          email: form.email.trim(),
          phone: form.phone.trim(),
          isActive: form.isActive,
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

      onSaved(mode === "create" ? "Customer created successfully." : "Customer updated successfully.");
      onClose();
    } catch {
      setError("Unable to save customer right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDeleteCustomer() {
    if (!customer || !canDeleteCustomer) return;
    setIsDeleteConfirmOpen(true);
  }

  async function confirmDeleteCustomer() {
    if (!customer || !canDeleteCustomer) return;

    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
      const data = (await response.json()) as CustomerApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to delete customer right now.");
        setIsDeleteConfirmOpen(false);
        return;
      }

      onSaved("Customer deleted successfully.");
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch {
      setError("Unable to delete customer right now.");
    } finally {
      setIsDeleting(false);
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

          {mode === "edit" ? (
            <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10">
              <input
                type="checkbox"
                checked={!form.isActive}
                onChange={(e) => updateField("isActive", !e.target.checked)}
                className="h-4 w-4 accent-red-500"
              />
              Set Inactive
            </label>
          ) : null}
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
                    className={`flex min-h-[46px] w-full rounded-xl border border-white/10 bg-black/40 text-left text-sm text-white transition hover:border-white/20 ${
                      customerInitial ? "cursor-pointer" : "cursor-default"
                    }`}
                    title={customerInitial ? "Click to override A/C No suffix" : ""}
                  >
                    <span className="flex w-[120px] shrink-0 items-center border-r border-white/10 px-4 text-white/50">
                      {accountPrefix}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center px-4 py-3 font-semibold text-white">
                      {accountSuffix || <span className="text-white/25">----</span>}
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
                <SearchableSelect
                  label="Country"
                  placeholder="Search or select country"
                  options={countryOptions}
                  value={form.billingCountryCode}
                  onChange={(option) => updateField("billingCountryCode", option?.id || "MY")}
                />
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
                <SearchableSelect
                  label="Country"
                  placeholder="Search or select country"
                  options={countryOptions}
                  value={form.deliveryCountryCode}
                  onChange={(option) => updateField("deliveryCountryCode", option?.id || "MY")}
                />
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
                <SearchableSelect
                  label="Currency"
                  placeholder="Search or select currency"
                  options={currencyOptions}
                  value={form.currency}
                  onChange={(option) => updateField("currency", option?.id || "MYR")}
                />
              </div>
              <div>
                <SearchableSelect
                  label="Credit Control"
                  placeholder="Select credit control"
                  options={creditControlOptions}
                  value={form.creditControlType}
                  onChange={(option) => updateField("creditControlType", (option?.id as CustomerFormState["creditControlType"]) || "NONE")}
                />
                <p className="mt-2 text-xs text-white/40">Only one credit control method can be active per customer.</p>
              </div>
              {form.creditControlType === "TERMS" ? (
                <div>
                  <FieldLabel>Credit Terms (Days)</FieldLabel>
                  <TextInput type="number" min="1" step="1" value={form.creditTermsDays} onChange={(value) => updateField("creditTermsDays", value.replace(/[^0-9]/g, ""))} placeholder="30" />
                  <p className="mt-2 text-xs text-white/40">Admin will be notified when unpaid invoice age is over this number of days.</p>
                </div>
              ) : null}
              {form.creditControlType === "LIMIT" ? (
                <div>
                  <FieldLabel>Credit Limit ({selectedCurrencyCode})</FieldLabel>
                  <TextInput type="number" min="0" step="0.01" value={form.creditLimitAmount} onChange={(value) => updateField("creditLimitAmount", value)} placeholder="0.00" />
                  <p className="mt-2 text-xs text-white/40">Admin will be notified when total outstanding invoices exceed this amount.</p>
                </div>
              ) : null}
              <div>
                <SearchableSelect
                  label="Agent"
                  placeholder="Search or select agent"
                  options={agentOptions}
                  value={form.agentId}
                  onChange={(option) => updateField("agentId", option?.id || "")}
                />
              </div>
              <div><FieldLabel>Nature of Business</FieldLabel><TextInput value={form.natureOfBusiness} onChange={(value) => updateField("natureOfBusiness", value)} placeholder="Enter nature of business" /></div>
              <div><FieldLabel>Attention</FieldLabel><TextInput value={form.attention} onChange={(value) => updateField("attention", value)} placeholder="Enter attention" /></div>
              <div><FieldLabel>Contact</FieldLabel><TextInput value={form.contactPerson} onChange={(value) => updateField("contactPerson", value)} placeholder="Enter contact person" /></div>
              <div>
                <SearchableSelect
                  label="Registration Type"
                  placeholder="Search or select registration type"
                  options={registrationTypeOptions}
                  value={form.registrationIdType}
                  onChange={(option) => updateField("registrationIdType", option?.id || "BRN")}
                />
              </div>
              <div><FieldLabel>Business Registration No.</FieldLabel><TextInput value={form.registrationNo} onChange={(value) => updateField("registrationNo", value)} placeholder="Enter registration no." /></div>
              <div><FieldLabel>Tax Identification No.</FieldLabel><TextInput value={form.taxIdentificationNo} onChange={(value) => updateField("taxIdentificationNo", value)} placeholder="Enter TIN no." /></div>
            </div>
          </div>

          {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">Save Failed</div><p className="mt-2 leading-6">{error}</p></div> : null}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {canDeleteCustomer ? (
                <button
                  type="button"
                  onClick={handleDeleteCustomer}
                  disabled={isSubmitting || isDeleting}
                  className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete Customer"}
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={onClose} disabled={isSubmitting || isDeleting} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSubmitting || isDeleting} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? (mode === "create" ? "Creating..." : "Saving...") : mode === "create" ? "Add Customer" : "Save Changes"}
              </button>
            </div>
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


        {isDeleteConfirmOpen && customer ? (
          <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/75 px-4">
            <div className="w-full max-w-lg rounded-[2rem] border border-red-500/30 bg-zinc-950 p-6 shadow-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-300/80">Delete Customer</p>
              <h3 className="mt-3 text-2xl font-bold text-white">Delete this customer profile?</h3>
              <p className="mt-3 text-sm leading-6 text-white/60">
                This action cannot be undone. This customer has no related transactions, so the profile can be permanently deleted.
              </p>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/75">
                <div className="font-semibold text-white">{customer.name}</div>
                <div className="mt-1 text-white/50">A/C No.: {customer.customerAccountNo || "-"}</div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                  className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCustomer}
                  disabled={isDeleting}
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete Customer"}
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
                <SearchableSelect
                  label="Country"
                  placeholder="Search or select country"
                  options={countryOptions}
                  value={deliveryAddressDraft.countryCode}
                  onChange={(option) => updateDeliveryAddressDraft("countryCode", option?.id || "MY")}
                />
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

export function AdminCustomerManagement({ customers, agents, countries, currencies, accountConfiguration, existingCustomerAccountNos, currentPage, pageSize }: Props) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [portalAccessTarget, setPortalAccessTarget] = useState<CustomerRecord | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState("");


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

  function handleSaved(message: string) {
    setSubmitSuccess(message);
    router.refresh();
  }

  function handleRowClick(customerId: string) {
    router.push(`/admin/customers/${customerId}`);
  }

  return (
    <>
      {submitSuccess ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {submitSuccess}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/20 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-md">
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Customer Records</h2>
            <p className="mt-1 text-sm text-white/45">Manage customer profiles, portal access, and credit control status.</p>
          </div>
          <button type="button" onClick={() => setIsCreateOpen(true)} className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10 sm:w-auto">Add Customer</button>
        </div>

        <div className="overflow-x-auto border-t border-white/10">
        <table className="min-w-[980px] text-left text-sm">
          <thead className="bg-black/50 text-white/65">
            <tr>
              <th className="w-[60px] px-4 py-4">No.</th>
              <th className="w-[150px] px-4 py-4">A/C No.</th>
              <th className="w-[220px] px-4 py-4">Customer</th>
              <th className="w-[150px] px-4 py-4">Phone</th>
              <th className="w-[230px] px-4 py-4">Email</th>
              <th className="w-[120px] px-4 py-4">Status</th>
              <th className="w-[170px] px-4 py-4">Credit Control</th>
              <th className="w-[110px] px-4 py-4">Orders</th>
              <th className="w-[150px] px-4 py-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.length > 0 ? customers.map((customer, index) => (
              <tr key={customer.id} onClick={() => handleRowClick(customer.id)} className="cursor-pointer border-t border-white/10 align-top transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-4 text-white/55">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="break-words px-4 py-4 text-white/85">{customer.customerAccountNo || "-"}</td>
                <td className="px-4 py-4"><div className="break-words font-semibold text-white/90">{customer.name}</div></td>
                <td className="break-words px-4 py-4 text-white/85">{customer.phone || "-"}</td>
                <td className="break-words px-4 py-4 text-white/85">{customer.email}</td>
                <td className="px-4 py-4"><span className={getCustomerStatusBadge(customer.isActive)}>{getCustomerStatusLabel(customer.isActive)}</span></td>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    <span className={getCreditBadge(customer)}>{getCreditLabel(customer)}</span>
                    <div className="text-xs text-white/45">Outstanding {customer.currency || "MYR"} {money(customer.creditOutstandingAmount || 0)}</div>
                  </div>
                </td>
                <td className="px-4 py-4 text-white/85">{customer.salesTransactionOrderCount ?? customer._count.orders}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-2">
                    {customer.isActive ? (
                      <Link href={`/admin/customers/${customer.id}/create-order`} onClick={(e) => e.stopPropagation()} className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center text-white transition hover:bg-white/10">Create Order</Link>
                    ) : (
                      <span className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-center text-white/35">Inactive</span>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCustomer(customer); }} className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white transition hover:bg-white/10">Edit</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-white/45">No customers found for the selected filters.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <CustomerModal isOpen={isCreateOpen} mode="create" customer={null} agents={agents} countries={countries} currencies={currencies} accountConfiguration={accountConfiguration} existingCustomerAccountNos={existingCustomerAccountNos} onClose={() => setIsCreateOpen(false)} onSaved={handleSaved} />
      <CustomerModal isOpen={editingCustomer !== null} mode="edit" customer={editingCustomer} agents={agents} countries={countries} currencies={currencies} accountConfiguration={accountConfiguration} existingCustomerAccountNos={existingCustomerAccountNos} onClose={() => setEditingCustomer(null)} onSaved={handleSaved} />
      <PortalAccessConfirmModal customer={portalAccessTarget} isSubmitting={!!(portalAccessTarget && isTogglingId === portalAccessTarget.id)} onClose={() => setPortalAccessTarget(null)} onConfirm={handleConfirmPortalAccess} />
      <TempPasswordModal password={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}
