import Link from "next/link";
import { Order, OrderFile, OrderItem, Product, User } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

type OrderWithRelations = Order & {
  user?: User;
  files: OrderFile[];
  items: (OrderItem & { product: Product })[];
};

export function OrderTable({
  orders,
  admin = false,
}: {
  orders: OrderWithRelations[];
  admin?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white/5 text-white/60">
          <tr>
            <th className="px-4 py-3">Order</th>
            {admin ? <th className="px-4 py-3">Customer</th> : null}
            <th className="px-4 py-3">Vehicle</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Files</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => {
            const customerOriginal = order.files.find(
              (f) => f.kind === "CUSTOMER_ORIGINAL"
            );
            const adminCompleted = order.files.find(
              (f) => f.kind === "ADMIN_COMPLETED"
            );
            const paymentProof = order.files.find(
              (f) => f.kind === "CUSTOMER_PAYMENT_PROOF"
            );

            const statusLabel =
              order.status === "AWAITING_PAYMENT"
                ? "DONE (PENDING PAYMENT)"
                : order.status.replaceAll("_", " ");

            return (
              <tr key={order.id} className="border-t border-white/10 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{order.orderNumber}</div>
                  <div className="text-white/45">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </td>

                {admin ? (
                  <td className="px-4 py-3">{order.user?.email}</td>
                ) : null}

                <td className="px-4 py-3">
                  {[
                    order.vehicleBrand,
                    order.vehicleModel,
                    order.vehicleYear,
                    order.ecuType,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "-"}
                </td>

                <td className="px-4 py-3">{statusLabel}</td>

                <td className="px-4 py-3">
                  {formatCurrency(order.totalAmount)}
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    {customerOriginal ? (
                      <Link
                        href={`/api/files/${customerOriginal.id}/download`}
                        className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                      >
                        Original File
                      </Link>
                    ) : (
                      <span className="text-white/40">No original file</span>
                    )}

                    {admin ? (
                      adminCompleted ? (
                        <Link
                          href={`/api/files/${adminCompleted.id}/download`}
                          className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                        >
                          Tuned File
                        </Link>
                      ) : (
                        <span className="text-white/40">No tuned file</span>
                      )
                    ) : order.status === "READY_FOR_DOWNLOAD" && adminCompleted ? (
                      <Link
                        href={`/api/files/${adminCompleted.id}/download`}
                        className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                      >
                        Tuned File
                      </Link>
                    ) : order.status === "AWAITING_PAYMENT" && adminCompleted ? (
                      <span className="text-amber-300/80">
                        Tuned file locked until payment is confirmed
                      </span>
                    ) : (
                      <span className="text-white/40">No tuned file</span>
                    )}

                    {paymentProof ? (
                      <Link
                        href={`/api/files/${paymentProof.id}/download`}
                        className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                      >
                        Payment Slip
                      </Link>
                    ) : admin ? (
                      <span className="text-white/40">No payment proof</span>
                    ) : null}
                  </div>
                </td>

                <td className="px-4 py-3">
                  {admin ? (
                    order.status === "CANCELLED" ? (
                      <span className="text-red-400">Order Cancelled</span>
                    ) : (
                      <div className="flex min-w-[260px] flex-col gap-3">
                        <form
                          action={`/api/admin/orders/${order.id}/upload`}
                          method="post"
                          encType="multipart/form-data"
                          className="flex flex-col gap-2"
                        >
                          <input
                            type="file"
                            name="file"
                            required
                            className="block w-full text-xs text-white/80 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-white/5 file:px-3 file:py-2 file:text-white hover:file:bg-white/10"
                          />
                          <button className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">
                            Upload Tuned File
                          </button>
                        </form>

                        {order.status === "AWAITING_PAYMENT" && paymentProof ? (
                          <form
                            action={`/api/admin/orders/${order.id}/complete`}
                            method="post"
                          >
                            <button className="rounded-xl border border-emerald-500/40 px-3 py-2 text-emerald-400 hover:bg-emerald-500/10">
                              Confirm Payment & Release
                            </button>
                          </form>
                        ) : order.status === "AWAITING_PAYMENT" ? (
                          <span className="text-amber-300/80">
                            Waiting for payment proof
                          </span>
                        ) : order.status === "READY_FOR_DOWNLOAD" ? (
                          <span className="text-emerald-400">
                            Download Released
                          </span>
                        ) : null}
                      </div>
                    )
                  ) : order.status === "CANCELLED" ? (
                    <span className="text-red-400">Cancelled</span>
                  ) : order.status === "READY_FOR_DOWNLOAD" && adminCompleted ? (
                    <Link
                      href={`/api/files/${adminCompleted.id}/download`}
                      className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                    >
                      Download
                    </Link>
                  ) : order.status === "AWAITING_PAYMENT" && adminCompleted ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-amber-300/80">
                        Done (Pending Payment)
                      </span>

                      <form
                        action={`/api/orders/${order.id}/upload-payment`}
                        method="post"
                        encType="multipart/form-data"
                        className="flex flex-col gap-2"
                      >
                        <input
                          type="file"
                          name="file"
                          required
                          className="block w-full text-xs text-white/80 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-white/5 file:px-3 file:py-2 file:text-white hover:file:bg-white/10"
                        />
                        <button className="rounded-xl border border-amber-500/40 px-3 py-2 text-amber-300 hover:bg-amber-500/10">
                          Upload Payment Slip
                        </button>
                      </form>
                    </div>
                  ) : order.status === "FILE_RECEIVED" ? (
                    <form
                      action={`/api/orders/${order.id}/cancel`}
                      method="post"
                    >
                      <button className="rounded-xl border border-red-500/40 px-3 py-2 text-red-400 hover:bg-red-500/10">
                        Cancel Order
                      </button>
                    </form>
                  ) : (
                    <span className="text-white/40">Waiting for file</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}