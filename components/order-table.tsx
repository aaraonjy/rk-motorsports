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

                <td className="px-4 py-3">
                  {order.status.replaceAll("_", " ")}
                </td>

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

                    {adminCompleted ? (
                      <Link
                        href={`/api/files/${adminCompleted.id}/download`}
                        className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                      >
                        Tuned File
                      </Link>
                    ) : (
                      <span className="text-white/40">No tuned file</span>
                    )}
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

                        <form
                          action={`/api/admin/orders/${order.id}/complete`}
                          method="post"
                        >
                          <button className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">
                            Mark Ready
                          </button>
                        </form>
                      </div>
                    )
                  ) : order.status === "CANCELLED" ? (
                    <span className="text-red-400">Cancelled</span>
                  ) : adminCompleted ? (
                    <Link
                      href={`/api/files/${adminCompleted.id}/download`}
                      className="inline-block rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10"
                    >
                      Download
                    </Link>
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