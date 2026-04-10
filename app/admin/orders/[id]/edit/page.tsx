import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CustomOrderForm } from "@/components/custom-order-form";

type EditOrderPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminEditCustomOrderPage({
  params,
}: EditOrderPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      customItems: {
        orderBy: { createdAt: "asc" },
      },
      payments: {
        orderBy: { paymentDate: "asc" },
      },
    },
  });

  if (!order || order.orderType !== "CUSTOM_ORDER") {
    redirect("/admin");
  }

  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    redirect("/admin");
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Phase 3C-1
            </p>
            <h1 className="mt-3 text-4xl font-bold">Edit Custom Order</h1>
            <p className="mt-4 text-white/70">
              Update the custom order details before the order is completed or cancelled.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10"
          >
            Back to Admin
          </Link>
        </div>

        <div className="mt-10 card-rk p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Order Information
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="text-sm text-white/45">Order Number</div>
              <div className="mt-2 text-lg font-semibold text-white">{order.orderNumber}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Customer Name</div>
              <div className="mt-2 text-lg font-semibold text-white">{order.user?.name || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Phone</div>
              <div className="mt-2 text-lg font-semibold text-white">{order.user?.phone || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Email</div>
              <div className="mt-2 break-words text-lg font-semibold text-white">{order.user?.email || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Status</div>
              <div className="mt-2 text-lg font-semibold text-white">{order.status.replaceAll("_", " ")}</div>
            </div>

            <div>
              <div className="text-sm text-white/45">Current Grand Total</div>
              <div className="mt-2 text-lg font-semibold text-white">RM {Number(order.totalAmount || 0).toFixed(0)}</div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <CustomOrderForm
            customerId={order.userId}
            orderId={order.id}
            submitLabel="Update Custom Order"
            submittingLabel="Updating Custom Order..."
            errorTitle="Update Order Failed"
            initialData={{
              orderId: order.id,
              customTitle: order.customTitle,
              vehicleNo: order.vehicleNo,
              internalRemarks: order.internalRemarks,
              customDiscount: order.customDiscount,
              totalPaid: order.totalPaid,
              outstandingBalance: order.outstandingBalance,
              payments: order.payments.map((payment) => ({
                id: payment.id,
                paymentDate: new Date(payment.paymentDate).toLocaleDateString("en-GB"),
                paymentMode: payment.paymentMode,
                amount: payment.amount,
              })),
              items: order.customItems.map((item) => ({
                id: item.id,
                description: item.description,
                qty: item.qty,
                unitPrice: item.unitPrice,
                uom: item.uom,
              })),
            }}
          />
        </div>
      </div>
    </section>
  );
}
