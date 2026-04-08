import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCustomerById } from "@/lib/queries";

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

export default async function AdminCustomerCreateOrderPage({
  params,
}: CreateOrderPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) redirect("/admin/customers");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Phase 3B-1
            </p>
            <h1 className="mt-3 text-4xl font-bold">Select Order Type</h1>
            <p className="mt-4 text-white/70">
              Choose the order flow you want to create for this customer.
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
              <div className="mt-2 text-lg font-semibold text-white">
                {customer.name}
              </div>
            </div>

            <div>
              <div className="text-sm text-white/45">Phone</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {customer.phone || "-"}
              </div>
            </div>

            <div>
              <div className="text-sm text-white/45">Email</div>
              <div className="mt-2 break-words text-lg font-semibold text-white">
                {customer.email}
              </div>
            </div>

            <div>
              <div className="text-sm text-white/45">Orders</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {customer._count.orders}
              </div>
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

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="card-rk flex h-full flex-col p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300/70">
              Option 1
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Standard ECU / TCU Tuning
            </h2>
            <p className="mt-4 text-white/70">
              Use our structured tuning workflow for ECU, TCU, or combined tuning jobs.
              Ideal for file-based remapping with full validation and automation.
            </p>

            <div className="mt-6 space-y-2 text-sm leading-6 text-white/65">
              <p>• Guided tuning workflow</p>
              <p>• ECU / TCU file upload & delivery</p>
              <p>• Built-in pricing and validation</p>
              <p>• Best for regular tuning jobs</p>
            </div>

            <div className="mt-8">
              <Link
                href={`/admin/customers/${customer.id}/create-order/standard`}
                className="inline-flex items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 font-medium text-sky-200 transition hover:bg-sky-500/15"
              >
                Start Standard Tuning
              </Link>
            </div>
          </div>

          <div className="card-rk flex h-full flex-col p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/70">
              Option 2
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Custom Service Order
            </h2>
            <p className="mt-4 text-white/70">
              Create flexible orders for services, diagnostics, or non-standard work.
              Perfect for manual jobs, workshop services, or special requests.
            </p>

            <div className="mt-6 space-y-2 text-sm leading-6 text-white/65">
              <p>• Manual description & pricing</p>
              <p>• Multiple line items</p>
              <p>• Discount and total calculation</p>
              <p>• Suitable for services & miscellaneous jobs</p>
            </div>

            <div className="mt-8">
              <Link
                href={`/admin/customers/${customer.id}/create-order/custom`}
                className="inline-flex items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 font-medium text-amber-200 transition hover:bg-amber-500/15"
              >
                Create Custom Order
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
