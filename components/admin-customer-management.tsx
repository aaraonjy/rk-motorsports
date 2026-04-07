"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CustomerRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  createdAt: string;
  _count: {
    orders: number;
  };
};

type Props = {
  customers: CustomerRecord[];
};

type FormMode = "create" | "edit";

type FormState = {
  name: string;
  email: string;
  phone: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
};

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
    ? "inline-flex min-w-[88px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300"
    : "inline-flex min-w-[88px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/75";
}

function CustomerFormModal({
  open,
  mode,
  customer,
  form,
  setForm,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  open: boolean;
  mode: FormMode;
  customer: CustomerRecord | null;
  form: FormState;
  setForm: (value: FormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  if (!open) return null;

  const title = mode === "create" ? "Add Customer" : "Edit Customer";
  const description =
    mode === "create"
      ? "Create a new customer record for walk-in or manual orders."
      : "Update the selected customer record.";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm text-white/50">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="mb-2 block text-sm text-white/70">
              Customer Name <span className="text-red-300">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Enter customer name"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">
              Email <span className="text-red-300">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="customer@example.com"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
              disabled={isSubmitting || (mode === "edit" && customer?.accountSource === "PORTAL")}
            />
            {mode === "edit" && customer?.accountSource === "PORTAL" ? (
              <p className="mt-2 text-xs text-white/40">
                Portal-registered customer email is locked here to avoid breaking login unexpectedly.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Phone Number</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. +60123456789"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
              disabled={isSubmitting}
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">
                Save Failed
              </div>
              <p className="mt-2 leading-6">{error}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : mode === "create" ? "Create Customer" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminCustomerManagement({ customers }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedCustomers = useMemo(
    () => customers.map((customer) => ({ ...customer, createdAt: new Date(customer.createdAt).toISOString() })),
    [customers]
  );

  function closeModal() {
    setModalOpen(false);
    setMode("create");
    setSelectedCustomer(null);
    setForm(initialForm);
    setError(null);
    setIsSubmitting(false);
  }

  function openCreate() {
    setMode("create");
    setSelectedCustomer(null);
    setForm(initialForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(customer: CustomerRecord) {
    setMode("edit");
    setSelectedCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone || "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function submitForm() {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!name) {
      setError("Customer name is required.");
      return;
    }

    if (!email) {
      setError("Email is required in the current system setup.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const url = mode === "create" ? "/api/admin/customers" : `/api/admin/customers/${selectedCustomer?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          phone: phone || null,
        }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to save customer right now.");
        return;
      }

      closeModal();
      router.refresh();
    } catch {
      setError("Unable to save customer right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white transition hover:bg-white/10"
        >
          Add Customer
        </button>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/20 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-md">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-black/50 text-white/65">
            <tr>
              <th className="px-4 py-4 w-[220px]">Customer</th>
              <th className="px-4 py-4 w-[180px]">Phone</th>
              <th className="px-4 py-4 w-[260px]">Email</th>
              <th className="px-4 py-4 w-[150px]">Source</th>
              <th className="px-4 py-4 w-[140px]">Portal Access</th>
              <th className="px-4 py-4 w-[110px]">Orders</th>
              <th className="px-4 py-4 w-[160px]">Created Date</th>
              <th className="px-4 py-4 w-[130px]">Action</th>
            </tr>
          </thead>

          <tbody>
            {normalizedCustomers.length > 0 ? (
              normalizedCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-t border-white/10 align-top transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold break-words text-white/90">
                      {customer.name}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-white/85 break-words">
                    {customer.phone || "-"}
                  </td>

                  <td className="px-4 py-4 text-white/85 break-words">
                    {customer.email}
                  </td>

                  <td className="px-4 py-4">
                    <span className={getSourceBadge(customer.accountSource)}>
                      {getSourceLabel(customer.accountSource)}
                    </span>
                  </td>

                  <td className="px-4 py-4">
                    <span className={getPortalAccessBadge(customer.portalAccess)}>
                      {customer.portalAccess ? "Enabled" : "Disabled"}
                    </span>
                  </td>

                  <td className="px-4 py-4 text-white/85">
                    {customer._count.orders}
                  </td>

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
                    <button
                      type="button"
                      onClick={() => openEdit(customer)}
                      className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-white/45">
                  No customers found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CustomerFormModal
        open={modalOpen}
        mode={mode}
        customer={selectedCustomer}
        form={form}
        setForm={setForm}
        onClose={closeModal}
        onSubmit={submitForm}
        isSubmitting={isSubmitting}
        error={error}
      />
    </>
  );
}
