import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCustomerById } from "@/lib/queries";
import { db } from "@/lib/db";
import { normalizeTaxCalculationMode } from "@/lib/tax";
import { CustomOrderForm } from "@/components/custom-order-form";

type CreateOrderPageProps = {
  params: Promise<{
    id: string;
  }>;
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

export default async function AdminCustomerCustomOrderPage({
  params,
}: CreateOrderPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const [customer, taxConfig, taxCodes, products] = await Promise.all([
    getCustomerById(id),
    db.taxConfiguration.findUnique({ where: { id: "default" } }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        rate: true,
        calculationMethod: true,
      },
    }),
    db.inventoryProduct.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        itemType: true,
        baseUom: true,
        sellingPrice: true,
        isActive: true,
      },
    }),
  ]);
  if (!customer) redirect("/admin/customers");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Phase 3B-2
            </p>
            <h1 className="mt-3 text-4xl font-bold">Custom Order</h1>
            <p className="mt-4 text-white/70">
              Create a manual custom order for service work, non-standard jobs, or miscellaneous billing items.
            </p>
          </div>

          <Link
            href={`/admin/customers/${customer.id}/create-order`}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10"
          >
            Back to Order Type
          </Link>
        </div>

        <div className="mt-10 card-rk p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Selected Customer
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="text-sm text-white/45">Customer Name</div>
              <div className="mt-2 text-lg font-semibold text-white">{customer.name}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Phone</div>
              <div className="mt-2 text-lg font-semibold text-white">{customer.phone || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Email</div>
              <div className="mt-2 break-words text-lg font-semibold text-white">{customer.email}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Orders</div>
              <div className="mt-2 text-lg font-semibold text-white">{customer._count.orders}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Account Source</div>
              <div className="mt-3">
                <span className={getSourceBadge(customer.accountSource)}>
                  {getSourceLabel(customer.accountSource)}
                </span>
              </div>
            </div>

            <div>
              <div className="text-sm text-white/45">Portal Access</div>
              <div className="mt-3">
                <span className={getPortalAccessBadge(customer.portalAccess)}>
                  {customer.portalAccess ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <CustomOrderForm
            customerId={customer.id}
            productOptions={products.map((item) => ({
              ...item,
              sellingPrice: Number(item.sellingPrice ?? 0),
            }))}
            taxConfig={{
              taxModuleEnabled: taxConfig?.taxModuleEnabled ?? false,
              taxCalculationMode: normalizeTaxCalculationMode(taxConfig?.taxCalculationMode),
              defaultAdminTaxCodeId: taxConfig?.defaultAdminTaxCodeId ?? "",
              taxCodes: taxCodes.map((item) => ({
                ...item,
                rate: Number(item.rate),
              })),
            }}
          />
        </div>
      </div>
    </section>
  );
}
