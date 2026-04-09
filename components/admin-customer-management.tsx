"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  currentPage: number;
  pageSize: number;
};

type CustomerFormState = {
  name: string;
  email: string;
  phone: string;
};

type CustomerApiResponse = {
  ok?: boolean;
  error?: string;
  tempPassword?: string;
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
    ? "inline-flex min-w-[88px] items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
    : "inline-flex min-w-[88px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-xs font-semibold text-white/75 transition hover:bg-white/15";
}

function CustomerModal({
  isOpen,
  mode,
  customer,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  mode: "create" | "edit";
  customer: CustomerRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerFormState>({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useMemo(() => {
    setForm({
      name: customer?.name || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
    });
    setError(null);
    setIsSubmitting(false);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const isPortalCustomer = customer?.accountSource === "PORTAL";

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
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {mode === "create" ? "Add Customer" : "Edit Customer"}
            </h3>
            <p className="mt-1 text-sm text-white/50">
              {mode === "create"
                ? "Create a new customer record for walk-in or admin-managed jobs."
                : "Update the customer details below."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-white/70">Customer Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Enter customer name"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">
              Email <span className="text-white/40">(required)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
              disabled={mode === "edit" && isPortalCustomer}
              placeholder="Enter email address"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {mode === "edit" && isPortalCustomer ? (
              <p className="mt-2 text-xs text-white/45">
                Email is locked for self-registered customers to avoid unexpected login issues.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">
              Phone <span className="text-white/40">(optional)</span>
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Enter phone number"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/20 focus:border-white/25"
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

export function AdminCustomerManagement({ customers, currentPage, pageSize }: Props) {
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
              <th className="px-4 py-4 w-[180px]">Phone</th>
              <th className="px-4 py-4 w-[260px]">Email</th>
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
                  className="border-t border-white/10 align-top transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-4 text-white/55">
                    {(currentPage - 1) * pageSize + index + 1}
                  </td>

                  <td className="px-4 py-4">
                    <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-semibold break-words text-white/90 transition hover:text-amber-200"
                      >
                        {customer.name}
                      </Link>
                  </td>

                  <td className="px-4 py-4 text-white/85 break-words">{customer.phone || "-"}</td>

                  <td className="px-4 py-4 text-white/85 break-words">{customer.email}</td>

                  <td className="px-4 py-4">
                    <span className={getSourceBadge(customer.accountSource)}>
                      {getSourceLabel(customer.accountSource)}
                    </span>
                  </td>

                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setPortalAccessTarget(customer)}
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
                        className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-white transition hover:bg-white/10"
                      >
                        Create Order
                      </Link>

                      <button
                        type="button"
                        onClick={() => setEditingCustomer(customer)}
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
                <td colSpan={9} className="px-4 py-10 text-center text-white/45">
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
        onClose={() => setIsCreateOpen(false)}
        onSaved={handleSaved}
      />

      <CustomerModal
        isOpen={editingCustomer !== null}
        mode="edit"
        customer={editingCustomer}
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
