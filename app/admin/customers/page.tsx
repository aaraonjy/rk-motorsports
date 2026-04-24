import { getSessionUser } from "@/lib/auth";
import { getCustomers } from "@/lib/queries";
import { redirect } from "next/navigation";
import { PaginationControls } from "@/components/pagination-controls";
import { AdminCustomerManagement } from "@/components/admin-customer-management";
import { db } from "@/lib/db";
import { DEFAULT_ACCOUNT_CONFIGURATION_ID, DEFAULT_CUSTOMER_ACCOUNT_FORMAT, DEFAULT_CUSTOMER_ACCOUNT_PREFIX } from "@/lib/customer-account";
import type { CustomerAccountNoFormat } from "@prisma/client";

type CustomersPageProps = {
  searchParams?: Promise<{
    search?: string;
    source?: string;
    portalAccess?: string;
    page?: string;
  }>;
};

type CustomerAgent = {
  id: string;
  code: string;
  name: string;
};

type CustomerDeliveryAddress = {
  id: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  city: string | null;
  postCode: string | null;
  countryCode: string | null;
};

type CustomerRecord = {
  id: string;
  name: string;
  customerAccountNo: string | null;
  email: string;
  phone: string | null;
  phone2: string | null;
  fax: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingAddressLine3: string | null;
  billingAddressLine4: string | null;
  billingCity: string | null;
  billingPostCode: string | null;
  billingCountryCode: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryAddressLine3: string | null;
  deliveryAddressLine4: string | null;
  deliveryCity: string | null;
  deliveryPostCode: string | null;
  deliveryCountryCode: string | null;
  area: string | null;
  attention: string | null;
  contactPerson: string | null;
  emailCc: string | null;
  currency: string;
  agentId: string | null;
  agent: CustomerAgent | null;
  natureOfBusiness: string | null;
  registrationIdType: string | null;
  registrationNo: string | null;
  taxIdentificationNo: string | null;
  deliveryAddresses: CustomerDeliveryAddress[];
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  createdAt: Date;
  _count: {
    orders: number;
  };
};

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

  const [result, agents, accountConfig, existingAccountNos] = await Promise.all([
    getCustomers({
      search,
      source,
      portalAccess,
      page,
      pageSize: 10,
    }) as Promise<{
      customers: CustomerRecord[];
      totalCount: number;
      currentPage: number;
      pageSize: number;
      totalPages: number;
    }>,
    db.agent.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    db.accountConfiguration.findUnique({
      where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
      select: { customerAccountPrefix: true, customerAccountNoFormat: true },
    }),
    db.user.findMany({
      where: { role: "CUSTOMER", customerAccountNo: { not: null } },
      select: { customerAccountNo: true },
    }),
  ]);

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
              Search by customer name, A/C No., phone number, or email, then filter by account
              source and portal access status.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Name / A/C No. / Phone Number / Email
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search name, A/C No., phone, or email"
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

          <AdminCustomerManagement
            customers={result.customers.map((customer) => ({
              ...customer,
              createdAt: customer.createdAt.toISOString(),
            }))}
            agents={agents}
            accountConfiguration={{
              customerAccountPrefix: accountConfig?.customerAccountPrefix || DEFAULT_CUSTOMER_ACCOUNT_PREFIX,
              customerAccountNoFormat: (accountConfig?.customerAccountNoFormat || DEFAULT_CUSTOMER_ACCOUNT_FORMAT) as CustomerAccountNoFormat,
            }}
            existingCustomerAccountNos={existingAccountNos
              .map((item) => item.customerAccountNo)
              .filter((value): value is string => Boolean(value))}
            currentPage={result.currentPage}
            pageSize={result.pageSize}
          />

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
