import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCustomerById } from "@/lib/queries";

type CreateOrderPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminCustomerCustomCreateOrderPage({
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
      <div className="container-rk max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Phase 3B-2
            </p>
            <h1 className="mt-3 text-4xl font-bold">Custom Order</h1>
            <p className="mt-4 text-white/70">
              Custom Order form UI is the next implementation step.
            </p>
          </div>

          <Link
            href={`/admin/customers/${customer.id}/create-order`}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10"
          >
            Back to Order Type
          </Link>
        </div>

        <div className="card-rk mt-10 p-6">
          <p className="text-sm leading-7 text-white/75">
            The Custom Order database foundation is ready, and the admin can now
            select the order type. The next step is to build the actual Custom
            Order form with:
          </p>

          <div className="mt-5 space-y-2 text-sm leading-6 text-white/65">
            <p>• Order title / summary</p>
            <p>• Internal remarks</p>
            <p>• Multiple line items</p>
            <p>• Subtotal, discount, and grand total</p>
            <p>• Custom invoice layout</p>
          </div>
        </div>
      </div>
    </section>
  );
}
