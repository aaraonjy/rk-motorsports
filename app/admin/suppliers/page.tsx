import { getSessionUser } from "@/lib/auth";
import { getSuppliers } from "@/lib/queries";
import { redirect } from "next/navigation";
import { PaginationControls } from "@/components/pagination-controls";
import { AdminSupplierManagement } from "@/components/suppliers/admin-supplier-management";
import { db } from "@/lib/db";
import { DEFAULT_ACCOUNT_CONFIGURATION_ID, DEFAULT_SUPPLIER_ACCOUNT_FORMAT, DEFAULT_SUPPLIER_ACCOUNT_PREFIX } from "@/lib/supplier-account";
import type { CustomerAccountNoFormat } from "@prisma/client";

type SuppliersPageProps = {
  searchParams?: Promise<{
    search?: string;
    source?: string;
    portalAccess?: string;
    status?: string;
    page?: string;
  }>;
};

type SupplierAgent = {
  id: string;
  code: string;
  name: string;
};

type CountryOption = {
  id: string;
  code: string;
  name: string;
};

type CurrencyOption = {
  id: string;
  code: string;
  name: string;
  symbol: string;
};

type SupplierDeliveryAddress = {
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

type SupplierRecord = {
  id: string;
  name: string;
  supplierAccountNo: string | null;
  email: string | null;
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
  agent: SupplierAgent | null;
  natureOfBusiness: string | null;
  registrationIdType: string | null;
  registrationNo: string | null;
  taxIdentificationNo: string | null;
  creditTermsDays: number;
  creditLimitAmount: string | number;
  creditOutstandingAmount?: number;
  creditOverdueAmount?: number;
  creditOldestOverdueDays?: number;
  creditLimitExceeded?: boolean;
  creditOverdue?: boolean;
  deliveryAddresses: SupplierDeliveryAddress[];
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  isActive: boolean;
  createdAt: Date;
  _count: {
    orders: number;
  };
};

export default async function AdminSuppliersPage({
  searchParams,
}: SuppliersPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const search = params.search || "";
  const source = params.source || "ALL";
  const portalAccess = params.portalAccess || "ALL";
  const status = params.status || "ACTIVE";
  const page = Math.max(1, Number(params.page || "1") || 1);

  const [result, agents, countries, currencies, accountConfig, existingAccountNos] = await Promise.all([
    getSuppliers({
      search,
      source,
      portalAccess,
      status,
      page,
      pageSize: 10,
    }) as Promise<{
      suppliers: SupplierRecord[];
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
    db.country.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
    }) as Promise<CountryOption[]>,
    db.currency.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true, symbol: true },
    }) as Promise<CurrencyOption[]>,
    db.accountConfiguration.findUnique({
      where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
      select: { supplierAccountPrefix: true, supplierAccountNoFormat: true },
    }),
    db.supplier.findMany({
      where: { supplierAccountNo: { not: null } },
      select: { supplierAccountNo: true },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Supplier Management</h1>
        <p className="mt-4 text-white/70">
          Review supplier records and payable control status in one place.
        </p>

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Search by supplier name, A/C No., contact number, or email, then filter by supplier status.
            </p>
          </div>

          <form method="get" className="card-rk grid items-end gap-4 p-6 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.15fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Name / A/C No. / Contact No
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search name, A/C No., contact, or email"
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

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Status
              </label>
              <div className="relative">
                <select
                  name="status"
                  defaultValue={status}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ACTIVE">Active Suppliers</option>
                  <option value="INACTIVE">Inactive Suppliers</option>
                  <option value="ALL">All Suppliers</option>
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

            <div className="flex flex-wrap items-end gap-3 xl:justify-end xl:whitespace-nowrap">
              <input type="hidden" name="page" value="1" />
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 hover:bg-white/10"
              >
                Apply
              </button>
              <a
                href="/admin/suppliers"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </a>
            </div>
          </form>

          <AdminSupplierManagement
            suppliers={result.suppliers.map((supplier) => ({
              ...supplier,
              createdAt: supplier.createdAt.toISOString(),
            }))}
            agents={agents}
            countries={countries}
            currencies={currencies}
            accountConfiguration={{
              supplierAccountPrefix: accountConfig?.supplierAccountPrefix || DEFAULT_SUPPLIER_ACCOUNT_PREFIX,
              supplierAccountNoFormat: (accountConfig?.supplierAccountNoFormat || DEFAULT_SUPPLIER_ACCOUNT_FORMAT) as CustomerAccountNoFormat,
            }}
            existingSupplierAccountNos={existingAccountNos
              .map((item) => item.supplierAccountNo)
              .filter((value): value is string => Boolean(value))}
            currentPage={result.currentPage}
            pageSize={result.pageSize}
          />

          <PaginationControls
            currentPage={result.currentPage}
            totalPages={result.totalPages}
            basePath="/admin/suppliers"
            params={{
              search: search || undefined,
              source: source !== "ALL" ? source : undefined,
              portalAccess: portalAccess !== "ALL" ? portalAccess : undefined,
              status: status !== "ACTIVE" ? status : undefined,
            }}
          />
        </div>
      </div>
    </section>
  );
}
