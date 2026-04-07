import { getSessionUser } from "@/lib/auth";
import { getCustomers } from "@/lib/queries";
import { redirect } from "next/navigation";
import { PaginationControls } from "@/components/pagination-controls";

type CustomersPageProps = {
  searchParams?: Promise<{
    search?: string;
    source?: string;
    portalAccess?: string;
    page?: string;
  }>;
};

type CustomerRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  createdAt: Date;
  _count: {
    orders: number;
  };
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

export default async function AdminCustomersPage({
  searchParams,
}: CustomersPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const search = params.search || "";
  const source = params.source || "ALL";
  const portalAccess = params.portalAccess || "ALL";
  const page = Math.max(1, Number(params.page || "1") || 1);

  const result = (await getCustomers({
    search,
    source,
    portalAccess,
    page,
    pageSize: 10,
  })) as {
    customers: CustomerRecord[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Customer Management</h1>
        <p className="mt-4 text-white/70">
          Review portal customers and admin-created customer records in one place.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Search by customer name, phone number, or email, then filter by account source and portal access status.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Customer Name / Phone Number / Email
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search name, phone, or email"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Account Source
              </label>
              <div className="relative">
                <select
                  name="source"
                  defaultValue={source}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Sources</option>
                  <option value="PORTAL">Self Registered</option>
                  <option value="ADMIN">Admin Created</option>
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

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Portal Access
              </label>
              <div className="relative">
                <select
                  name="portalAccess"
                  defaultValue={portalAccess}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Access States</option>
                  <option value="ENABLED">Enabled</option>
                  <option value="DISABLED">Disabled</option>
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

            <div className="flex flex-wrap items-end gap-3 xl:justify-end">
              <input type="hidden" name="page" value="1" />
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 hover:bg-white/10"
              >
                Apply
              </button>
              <a
                href="/admin/customers"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </a>
            </div>
          </form>

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
                </tr>
              </thead>

              <tbody>
                {result.customers.length > 0 ? (
                  result.customers.map((customer) => (
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
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-white/45">
                      No customers found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={result.currentPage}
            totalPages={result.totalPages}
            basePath="/admin/customers"
            params={{
              search: search || undefined,
              source: source !== "ALL" ? source : undefined,
              portalAccess: portalAccess !== "ALL" ? portalAccess : undefined,
            }}
          />
        </div>
      </div>
    </section>
  );
}
