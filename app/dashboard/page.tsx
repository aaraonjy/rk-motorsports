import { getSessionUser } from "@/lib/auth";
import { getRecentOrdersForUser } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable } from "@/components/order-table";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");

  const orders = await getRecentOrdersForUser(user.id);

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Customer Dashboard</h1>
        <p className="mt-4 text-white/70">Track order status and download completed tuned files.</p>
        <div className="mt-8">
          <OrderTable orders={orders} />
        </div>
      </div>
    </section>
  );
}
