"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CleanupAuditLogsButtonProps = {
  retentionDays: number;
};

type CleanupState =
  | { tone: "success"; message: string }
  | { tone: "neutral"; message: string }
  | { tone: "error"; message: string };

export function CleanupAuditLogsButton({ retentionDays }: CleanupAuditLogsButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  function closeModal() {
    if (isSubmitting) return;
    setIsModalOpen(false);
  }

  function emitResult(result: CleanupState) {
    window.dispatchEvent(
      new CustomEvent("rk-audit-cleanup-result", {
        detail: result,
      })
    );
  }

  async function handleCleanup() {
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
        emitResult({
          tone: "error",
          message: data.error || "Unable to clean audit logs right now.",
        });
        return;
      }

      setIsModalOpen(false);
      emitResult(
        data.deletedCount > 0
          ? {
              tone: "success",
              message: `Deleted ${data.deletedCount} audit log(s) older than ${retentionDays} days.`,
            }
          : {
              tone: "neutral",
              message: `No audit logs older than ${retentionDays} days were found.`,
            }
      );
      router.refresh();
    } catch {
      emitResult({
        tone: "error",
        message: "Unable to clean audit logs right now.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={isSubmitting}
        className="rounded-2xl border border-red-500/30 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Cleaning..." : `Delete Logs > ${retentionDays} Days`}
      </button>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-400/80">Audit Log Cleanup</p>
              <h2 className="mt-3 text-2xl font-bold text-white">Delete Logs Older Than {retentionDays} Days</h2>
              <p className="mt-3 text-sm leading-7 text-white/70">
                This will permanently delete audit logs older than {retentionDays} days. This action cannot be undone.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              Only proceed when you are sure older audit records are no longer required.
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleCleanup}
                disabled={isSubmitting}
                className="rounded-2xl border border-red-500/30 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Cleaning..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
