import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable } from "@/components/order-table";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const orders = await getAllOrders();

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <p className="mt-4 text-white/70">Review orders, uploaded files, and mark jobs ready for download.</p>
        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/70">
            <p>To simulate completed file delivery locally, place a file inside <code className="rounded bg-black/40 px-2 py-1">public/uploads</code> and add an admin-completed record manually or extend the admin upload route later.</p>
          </div>
          <OrderTable orders={orders} admin />
        </div>
      </div>
    </section>
  );
}
