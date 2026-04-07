import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCustomerById, getProducts } from "@/lib/queries";
import { CustomTuningForm } from "@/components/custom-tuning-form";

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

export default async function AdminCustomerCreateOrderPage({ params }: CreateOrderPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) redirect("/admin/customers");

  const products = await getProducts();
  const customProduct = products.find((p) => p.slug === "custom-file-service");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Phase 3A-3
            </p>
            <h1 className="mt-3 text-4xl font-bold">Create Order</h1>
            <p className="mt-4 text-white/70">
              Create a tuning order for the selected customer using the shared form in admin mode.
            </p>
          </div>

          <Link
            href="/admin/customers"
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10"
          >
            Back to Customers
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
              <div className="mt-2 text-lg font-semibold text-white break-words">{customer.email}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Orders</div>
              <div className="mt-2 text-lg font-semibold text-white">{customer._count.orders}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Account Source</div>
              <div className="mt-3">
                <span className={getSourceBadge(customer.accountSource)}>{getSourceLabel(customer.accountSource)}</span>
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

        {!customProduct ? (
          <div className="card-rk mt-10 p-6 text-white/70">
            <p className="font-medium text-white">
              Custom File Service product is not configured yet.
            </p>
            <p className="mt-3 text-white/65">
              Please run the database seed or create the product record with slug {" "}
              <code className="rounded bg-black/40 px-2 py-1">custom-file-service</code>.
            </p>
          </div>
        ) : (
          <div className="mt-10">
            <CustomTuningForm
              productId={customProduct.id}
              adminMode
              customerId={customer.id}
            />
          </div>
        )}
      </div>
    </section>
  );
}
