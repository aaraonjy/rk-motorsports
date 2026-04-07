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
        {/* unchanged */}
        {/* ... keep everything same ... */}
      </div>
    </div>
  );
}

/* =========================
   ✅ FIXED PART START HERE
========================= */

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
            className={`rounded-xl border px-4 py-2 text-sm transition
              ${
                copied
                  ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                  : "border-white/15 text-white/80 hover:bg-white/10"
              }
              disabled:cursor-not-allowed disabled:opacity-50
            `}
          >
            {copied ? "Copied ✓" : "Copy Password"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {copied && (
          <p className="mt-3 text-sm text-emerald-300">
            Password copied to clipboard.
          </p>
        )}
      </div>
    </div>
  );
}

/* =========================
   ✅ FIXED PART END
========================= */

export function AdminCustomerManagement({ customers, currentPage, pageSize }: Props) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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

  function handleSaved() {
    router.refresh();
  }

  return (
    <>
      {/* unchanged */}
      <TempPasswordModal password={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}