import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AuditLogTableClient } from "./audit-log-table-client";
import { CleanupAuditLogsButton } from "./cleanup-audit-logs-button";

type AuditLogsPageProps = {
  searchParams?: Promise<{
    period?: string;
    user?: string;
    module?: string;
    action?: string;
    status?: string;
    q?: string;
    doc?: string;
    page?: string;
  }>;
};

const PERIOD_OPTIONS = [1, 7, 30, 60, 90, 120] as const;
const PAGE_SIZE = 25;

function getDateFromPeriod(period: number) {
  const date = new Date();
  date.setDate(date.getDate() - period);
  return date;
}

function getQuickFilterLabel(period: number) {
  switch (period) {
    case 1:
      return "Today";
    case 7:
      return "Last 7 days";
    case 30:
      return "Last 30 days";
    default:
      return `Last ${period} days`;
  }
}

function buildQuickFilterHref(period: number) {
  return `/admin/settings/audit-logs?period=${period}`;
}

export default async function AuditLogsPage({ searchParams }: AuditLogsPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const selectedPeriod = PERIOD_OPTIONS.includes(Number(params.period) as (typeof PERIOD_OPTIONS)[number])
    ? Number(params.period)
    : 30;
  const selectedUser = (params.user || "ALL").trim();
  const selectedModule = (params.module || "ALL").trim();
  const selectedAction = (params.action || "ALL").trim();
  const selectedStatus = (params.status || "ALL").trim();
  const searchKeyword = (params.q || "").trim();
  const selectedDocument = (params.doc || "").trim();
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const skip = (currentPage - 1) * PAGE_SIZE;

  const where = {
    createdAt: {
      gte: getDateFromPeriod(selectedPeriod),
    },
    ...(selectedUser !== "ALL" ? { userEmail: selectedUser } : {}),
    ...(selectedModule !== "ALL" ? { module: selectedModule } : {}),
    ...(selectedAction !== "ALL" ? { action: selectedAction } : {}),
    ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}),
    ...(selectedDocument
      ? {
          entityCode: {
            contains: selectedDocument,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(searchKeyword
      ? {
          OR: [
            { description: { contains: searchKeyword, mode: "insensitive" as const } },
            { entityCode: { contains: searchKeyword, mode: "insensitive" as const } },
            { userName: { contains: searchKeyword, mode: "insensitive" as const } },
            { userEmail: { contains: searchKeyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [logs, totalCount, userOptions, moduleOptions, actionOptions] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      distinct: ["userEmail"],
      orderBy: { userEmail: "asc" },
      select: { userEmail: true, userName: true },
      where: { userEmail: { not: null } },
    }),
    db.auditLog.findMany({
      distinct: ["module"],
      orderBy: { module: "asc" },
      select: { module: true },
    }),
    db.auditLog.findMany({
      distinct: ["action"],
      orderBy: { action: "asc" },
      select: { action: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const serializedLogs = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userName: log.userName,
    userEmail: log.userEmail,
    module: log.module,
    action: log.action,
    entityCode: log.entityCode,
    description: log.description,
    ipAddress: log.ipAddress,
    location: log.location,
    status: log.status,
    userAgent: log.userAgent,
    requestId: log.requestId,
    oldValues: log.oldValues,
    newValues: log.newValues,
  }));

  return (
    <section className="section-pad">
      <div className="container-rk">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Global Settings</p>
            <h1 className="mt-3 text-4xl font-bold">Audit Logs</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Review admin activity history across authentication, orders, payments, credit notes, payment slip updates,
              and report exports.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            {[1, 7, 30].map((period) => {
              const isActive = selectedPeriod === period;
              return (
                <a
                  key={period}
                  href={buildQuickFilterHref(period)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "border-red-500/40 bg-red-500/10 text-red-200"
                      : "border-white/15 text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {getQuickFilterLabel(period)}
                </a>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/admin/settings/audit-logs/export?period=${selectedPeriod}&user=${encodeURIComponent(
                selectedUser
              )}&module=${encodeURIComponent(selectedModule)}&action=${encodeURIComponent(
                selectedAction
              )}&status=${encodeURIComponent(selectedStatus)}&q=${encodeURIComponent(
                searchKeyword
              )}&doc=${encodeURIComponent(selectedDocument)}`}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Export Audit Logs CSV
            </a>

            <CleanupAuditLogsButton retentionDays={180} />
          </div>
        </div>

        <form method="get" className="mt-4 card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm text-white/65">View Period</label>
            <div className="relative">
              <select name="period" defaultValue={String(selectedPeriod)} className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none">
                {PERIOD_OPTIONS.map((period) => (
                  <option key={period} value={period}>{getQuickFilterLabel(period)}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">User</label>
            <div className="relative">
              <select name="user" defaultValue={selectedUser} className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none">
                <option value="ALL">All Users</option>
                {userOptions.filter((item) => item.userEmail).map((item) => (
                  <option key={item.userEmail ?? "unknown"} value={item.userEmail ?? ""}>{item.userName || item.userEmail}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">Module</label>
            <div className="relative">
              <select name="module" defaultValue={selectedModule} className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none">
                <option value="ALL">All Modules</option>
                {moduleOptions.map((item) => (
                  <option key={item.module} value={item.module}>{item.module}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">Action</label>
            <div className="relative">
              <select name="action" defaultValue={selectedAction} className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none">
                <option value="ALL">All Actions</option>
                {actionOptions.map((item) => (
                  <option key={item.action} value={item.action}>{item.action}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">Status</label>
            <div className="relative">
              <select name="status" defaultValue={selectedStatus} className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none">
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">Search</label>
            <input type="text" name="q" defaultValue={searchKeyword} placeholder="Search user, reference, or keyword" className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35" />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">Document / Reference</label>
            <input type="text" name="doc" defaultValue={selectedDocument} placeholder="Search invoice, CN, or document no" className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35" />
          </div>

          <div className="flex items-end gap-3 xl:col-span-3 xl:justify-end">
            <button type="submit" className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Apply</button>
            <a href="/admin/settings/audit-logs" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">Reset</a>
          </div>
        </form>

        <AuditLogTableClient
          logs={serializedLogs}
          currentPage={Math.min(currentPage, totalPages)}
          totalPages={totalPages}
          currentQuery={{
            period: String(selectedPeriod),
            user: selectedUser,
            module: selectedModule,
            action: selectedAction,
            status: selectedStatus,
            q: searchKeyword,
            doc: selectedDocument,
          }}
        />
      </div>
    </section>
  );
}
