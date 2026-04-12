"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CleanupAuditLogsButtonProps = {
  retentionDays: number;
};

export function CleanupAuditLogsButton({ retentionDays }: CleanupAuditLogsButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCleanup() {
    const confirmed = window.confirm(
      `This will delete audit logs older than ${retentionDays} days. This action cannot be undone. Continue?`
    );

    if (!confirmed) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/settings/audit-logs/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rk-client-submit": "1",
        },
        body: JSON.stringify({ retentionDays }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        window.alert(data.error || "Unable to clean audit logs right now.");
        return;
      }

      window.alert(`Deleted ${data.deletedCount} audit log(s) older than ${retentionDays} days.`);
      router.refresh();
    } catch {
      window.alert("Unable to clean audit logs right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCleanup}
      disabled={isSubmitting}
      className="rounded-2xl border border-red-500/30 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSubmitting ? "Cleaning..." : `Delete Logs > ${retentionDays} Days`}
    </button>
  );
}
