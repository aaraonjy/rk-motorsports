"use client";

import { useMemo, useState } from "react";
import type { CustomerAccountNoFormat } from "@prisma/client";
import { CUSTOMER_ACCOUNT_FORMAT_OPTIONS } from "@/lib/customer-account";

type Props = {
  initialCustomerAccountPrefix: string;
  initialCustomerAccountNoFormat: CustomerAccountNoFormat;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
};

export function AccountConfigurationForm({
  initialCustomerAccountPrefix,
  initialCustomerAccountNoFormat,
}: Props) {
  const [customerAccountPrefix, setCustomerAccountPrefix] = useState(
    initialCustomerAccountPrefix
  );
  const [customerAccountNoFormat, setCustomerAccountNoFormat] = useState<CustomerAccountNoFormat>(
    initialCustomerAccountNoFormat
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedFormat = useMemo(
    () =>
      CUSTOMER_ACCOUNT_FORMAT_OPTIONS.find(
        (option) => option.value === customerAccountNoFormat
      ) || CUSTOMER_ACCOUNT_FORMAT_OPTIONS[0],
    [customerAccountNoFormat]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/settings/account-configuration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerAccountPrefix,
          customerAccountNoFormat,
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to save account configuration.");
        return;
      }

      setMessage("Account configuration saved successfully.");
    } catch {
      setError("Unable to save account configuration.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 card-rk space-y-6 p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-white/65">
            Customer A/C Prefix
          </label>
          <input
            type="text"
            value={customerAccountPrefix}
            onChange={(e) => setCustomerAccountPrefix(e.target.value.toUpperCase())}
            placeholder="3000"
            className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
          />
          <p className="mt-2 text-xs leading-5 text-white/45">
            Current preview: {customerAccountPrefix || "3000"}/A
            {"0".repeat(Math.max(1, selectedFormat.suffixLength - 2))}1
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/65">
            Customer A/C Format
          </label>
          <div className="relative">
            <select
              value={customerAccountNoFormat}
              onChange={(e) =>
                setCustomerAccountNoFormat(e.target.value as CustomerAccountNoFormat)
              }
              className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
            >
              {CUSTOMER_ACCOUNT_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl border border-white/15 bg-black/30 px-5 py-3 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </form>
  );
}
