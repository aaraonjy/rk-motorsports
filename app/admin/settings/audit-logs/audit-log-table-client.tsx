"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type AuditLogRow = {
  id: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  module: string;
  action: string;
  entityCode: string | null;
  description: string;
  ipAddress: string | null;
  location: string | null;
  status: string;
  userAgent: string | null;
  requestId: string | null;
  oldValues: unknown;
  newValues: unknown;
};

type AuditLogTableClientProps = {
  logs: AuditLogRow[];
  currentPage: number;
  totalPages: number;
  currentQuery: {
    period: string;
    user: string;
    module: string;
    action: string;
    status: string;
    q: string;
    doc: string;
  };
};

type FormattedDateTime = {
  datePart: string;
  timePart: string;
};

function formatDateTime(value: string): FormattedDateTime {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      datePart: "-",
      timePart: "-",
    };
  }

  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return { datePart, timePart };
}

function buildPageHref(
  page: number,
  currentQuery: AuditLogTableClientProps["currentQuery"],
) {
  const params = new URLSearchParams();
  params.set("page", String(page));

  if (currentQuery.period && currentQuery.period !== "30") params.set("period", currentQuery.period);
  if (currentQuery.user && currentQuery.user !== "ALL") params.set("user", currentQuery.user);
  if (currentQuery.module && currentQuery.module !== "ALL") params.set("module", currentQuery.module);
  if (currentQuery.action && currentQuery.action !== "ALL") params.set("action", currentQuery.action);
  if (currentQuery.status && currentQuery.status !== "ALL") params.set("status", currentQuery.status);
  if (currentQuery.q) params.set("q", currentQuery.q);
  if (currentQuery.doc) params.set("doc", currentQuery.doc);

  const query = params.toString();
  return query ? `/admin/settings/audit-logs?${query}` : "/admin/settings/audit-logs";
}

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) {
    return <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/45">No data recorded.</div>;
  }

  return (
    <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-6 text-white/80">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function getActionTone(log: AuditLogRow) {
  const moduleName = log.module.toUpperCase();
  const actionName = log.action.toUpperCase();

  if (moduleName === "CREDIT NOTES") {
    return "text-amber-200";
  }

  if (actionName === "CANCEL" || actionName === "FAILED_LOGIN") {
    return "text-red-300";
  }

  if (actionName === "COMPLETE" || actionName === "LOGIN" || actionName === "EXPORT") {
    return "text-emerald-300";
  }

  return "text-white";
}

export function AuditLogTableClient({ logs, currentPage, totalPages, currentQuery }: AuditLogTableClientProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  const pageLinks = useMemo(() => {
    const links: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let page = start; page <= end; page += 1) {
      links.push(page);
    }

    return links;
  }, [currentPage, totalPages]);

  return (
    <>
      <div className="mt-8 card-rk overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white/80">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-white/45">
              <tr>
                <th className="px-5 py-4 font-medium">Date &amp; Time</th>
                <th className="px-5 py-4 font-medium">User</th>
                <th className="px-5 py-4 font-medium">Action</th>
                <th className="px-5 py-4 font-medium">Document</th>
                <th className="px-5 py-4 font-medium">IP</th>
                <th className="px-5 py-4 font-medium">Location</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-white/55">
                    No audit logs found for the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const formatted = formatDateTime(log.createdAt);
                  const actionTone = getActionTone(log);

                  return (
                    <tr key={log.id} className="border-t border-white/8">
                      <td className="px-5 py-4 align-top">
                        <div>{formatted.datePart}</div>
                        <div className="mt-1 text-xs text-white/45">{formatted.timePart}</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="font-medium text-white">{log.userName || "System"}</div>
                        <div className="mt-1 text-xs text-white/45">{log.userEmail || "-"}</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className={`font-medium ${actionTone}`}>{log.description}</div>
                      </td>
                      <td className="px-5 py-4 align-top">{log.entityCode || "-"}</td>
                      <td className="px-5 py-4 align-top">{log.ipAddress || "-"}</td>
                      <td className="px-5 py-4 align-top">{log.location || log.ipAddress || "-"}</td>
                      <td className="px-5 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            log.status === "SUCCESS"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {log.status === "SUCCESS" ? "Success" : "Failed"}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-white/55">
            Page {currentPage} of {totalPages}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildPageHref(Math.max(1, currentPage - 1), currentQuery)}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                currentPage === 1
                  ? "pointer-events-none border-white/10 text-white/25"
                  : "border-white/15 text-white/80 hover:bg-white/10"
              }`}
            >
              Previous
            </Link>

            {pageLinks.map((page) => (
              <Link
                key={page}
                href={buildPageHref(page, currentQuery)}
                className={`rounded-xl border px-4 py-2 text-sm transition ${
                  page === currentPage
                    ? "border-red-500/40 bg-red-500/10 text-red-200"
                    : "border-white/15 text-white/80 hover:bg-white/10"
                }`}
              >
                {page}
              </Link>
            ))}

            <Link
              href={buildPageHref(Math.min(totalPages, currentPage + 1), currentQuery)}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                currentPage === totalPages
                  ? "pointer-events-none border-white/10 text-white/25"
                  : "border-white/15 text-white/80 hover:bg-white/10"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}

      {selectedLog ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Audit Log Details</h2>
                <p className="mt-1 text-sm text-white/45">Review the captured metadata and before/after values.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Summary</div>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  <div><span className="text-white/45">Description:</span> {selectedLog.description}</div>
                  <div><span className="text-white/45">Module / Action:</span> {selectedLog.module} / {selectedLog.action}</div>
                  <div><span className="text-white/45">Document:</span> {selectedLog.entityCode || "-"}</div>
                  <div><span className="text-white/45">Status:</span> {selectedLog.status}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Request Metadata</div>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  <div><span className="text-white/45">User:</span> {selectedLog.userName || "System"}</div>
                  <div><span className="text-white/45">Email:</span> {selectedLog.userEmail || "-"}</div>
                  <div><span className="text-white/45">IP:</span> {selectedLog.ipAddress || "-"}</div>
                  <div><span className="text-white/45">Location:</span> {selectedLog.location || selectedLog.ipAddress || "-"}</div>
                  <div><span className="text-white/45">User Agent:</span> {selectedLog.userAgent || "-"}</div>
                  <div><span className="text-white/45">Request ID:</span> {selectedLog.requestId || "-"}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Before Change</div>
                <JsonBlock value={selectedLog.oldValues} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">After Change</div>
                <JsonBlock value={selectedLog.newValues} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
