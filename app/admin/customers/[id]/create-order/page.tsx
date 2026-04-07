import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getCustomerById } from "@/lib/queries";
import { redirect } from "next/navigation";

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

  if (!customer) {
    redirect("/admin/customers");
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Phase 3A-2
            </p>
            <h1 className="mt-3 text-4xl font-bold">Create Order</h1>
            <p className="mt-4 text-white/70">
              Admin order creation shell for the selected customer. Form integration
              will be added in the next step.
            </p>
          </div>

          <Link
            href="/admin/customers"
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10"
          >
            Back to Customers
          </Link>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card-rk p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Selected Customer
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
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
                <div className="mt-2 text-lg font-semibold text-white break-words">
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

          <div className="card-rk p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Next Step
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Form Integration Pending
            </h2>
            <p className="mt-4 text-white/70 leading-7">
              This page shell is ready. In Phase 3A-3, we will plug in the shared
              tuning form in admin mode so you can create an order directly for{" "}
              <span className="font-semibold text-white">{customer.name}</span>{" "}
              without affecting the current online customer custom tuning flow.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 text-white/75">
              <p>
                Planned next integration:
              </p>
              <div className="mt-3 space-y-2 text-sm text-white/65">
                <div>• Admin-only create order flow</div>
                <div>• Selected customer pre-attached</div>
                <div>• Shared form with admin mode</div>
                <div>• No change to the live customer-facing submit flow yet</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
