import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

type AuditLogsPageProps = {
  searchParams?: Promise<{
    period?: string;
    user?: string;
    module?: string;
    action?: string;
    status?: string;
    q?: string;
  }>;
};

const PERIOD_OPTIONS = [30, 60, 90, 120] as const;

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function getDateFromPeriod(period: number) {
  const date = new Date();
  date.setDate(date.getDate() - period);
  return date;
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

  const where = {
    createdAt: {
      gte: getDateFromPeriod(selectedPeriod),
    },
    ...(selectedUser !== "ALL"
      ? {
          userEmail: selectedUser,
        }
      : {}),
    ...(selectedModule !== "ALL"
      ? {
          module: selectedModule,
        }
      : {}),
    ...(selectedAction !== "ALL"
      ? {
          action: selectedAction,
        }
      : {}),
    ...(selectedStatus !== "ALL"
      ? {
          status: selectedStatus,
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

  const [logs, userOptions, moduleOptions, actionOptions] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
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

  return (
    <section className="section-pad">
      <div className="container-rk">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">
              Global Settings
            </p>
            <h1 className="mt-3 text-4xl font-bold">Audit Logs</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Review admin activity history and prepare the system foundation for future detailed audit tracking.
            </p>
          </div>
        </div>

        <div className="mt-8 card-rk p-6 text-white/75">
          <p>
            Batch 1 includes the Audit Logs page structure, filters, and database foundation. Action-based log recording will be connected in the next batch.
          </p>
        </div>

        <form method="get" className="mt-4 card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm text-white/65">View Period</label>
            <div className="relative">
              <select
                name="period"
                defaultValue={String(selectedPeriod)}
                className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
              >
                {PERIOD_OPTIONS.map((period) => (
                  <option key={period} value={period}>
                    Last {period} days
                  </option>
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
              <select
                name="user"
                defaultValue={selectedUser}
                className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
              >
                <option value="ALL">All Users</option>
                {userOptions
                  .filter((item) => item.userEmail)
                  .map((item) => (
                    <option key={item.userEmail ?? "unknown"} value={item.userEmail ?? ""}>
                      {item.userName || item.userEmail}
                    </option>
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
              <select
                name="module"
                defaultValue={selectedModule}
                className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
              >
                <option value="ALL">All Modules</option>
                {moduleOptions.map((item) => (
                  <option key={item.module} value={item.module}>
                    {item.module}
                  </option>
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
              <select
                name="action"
                defaultValue={selectedAction}
                className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
              >
                <option value="ALL">All Actions</option>
                {actionOptions.map((item) => (
                  <option key={item.action} value={item.action}>
                    {item.action}
                  </option>
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
              <select
                name="status"
                defaultValue={selectedStatus}
                className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
              >
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
            <input
              type="text"
              name="q"
              defaultValue={searchKeyword}
              placeholder="Search user, reference, or keyword"
              className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div className="flex items-end gap-3 xl:col-span-3 xl:justify-end">
            <button
              type="submit"
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Apply
            </button>
            <a
              href="/admin/settings/audit-logs"
              className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Reset
            </a>
          </div>
        </form>

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
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-white/55">
                      No audit logs found yet. Batch 2 will begin recording actual activity into this table.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-white/8">
                      <td className="px-5 py-4 align-top">{formatDateTime(log.createdAt)}</td>
                      <td className="px-5 py-4 align-top">
                        <div className="font-medium text-white">{log.userName || "System"}</div>
                        <div className="mt-1 text-xs text-white/45">{log.userEmail || "-"}</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="font-medium text-white">{log.description}</div>
                        <div className="mt-1 text-xs text-white/45">
                          {log.module} / {log.action}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">{log.entityCode || "-"}</td>
                      <td className="px-5 py-4 align-top">{log.ipAddress || "-"}</td>
                      <td className="px-5 py-4 align-top">{log.location || "-"}</td>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
