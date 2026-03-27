import Link from "next/link";
import { Order, OrderFile, OrderItem, Product, User } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

type OrderWithRelations = Order & {
  user?: User;
  files: OrderFile[];
  items: (OrderItem & { product: Product })[];
};

export function OrderTable({ orders, admin = false }: { orders: OrderWithRelations[]; admin?: boolean }) {
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
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-white/10">
              <td className="px-4 py-3">
                <div className="font-medium">{order.orderNumber}</div>
                <div className="text-white/45">{new Date(order.createdAt).toLocaleDateString()}</div>
              </td>
              {admin ? <td className="px-4 py-3">{order.user?.email}</td> : null}
              <td className="px-4 py-3">{[order.vehicleBrand, order.vehicleModel, order.vehicleYear, order.ecuType].filter(Boolean).join(" / ") || "-"}</td>
              <td className="px-4 py-3">{order.status.replaceAll("_", " ")}</td>
              <td className="px-4 py-3">{formatCurrency(order.totalAmount)}</td>
              <td className="px-4 py-3">{order.files.length}</td>
              <td className="px-4 py-3">
                {admin ? (
                  <form action={`/api/admin/orders/${order.id}/complete`} method="post">
                    <button className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">Mark ready</button>
                  </form>
                ) : (
                  <Link href={order.files.find((f) => f.kind === "ADMIN_COMPLETED") ? `/api/files/${order.files.find((f) => f.kind === "ADMIN_COMPLETED")!.id}/download` : "/dashboard"} className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10 inline-block">
                    Download
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
