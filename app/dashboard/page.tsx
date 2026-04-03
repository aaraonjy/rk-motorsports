import { getSessionUser } from "@/lib/auth";
import { getRecentOrdersForUser } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable } from "@/components/order-table";
import { paymentConfig } from "@/lib/payment-config";
import { ClearSuccessParam } from "@/components/clear-success-param";

type DashboardPageProps = {
  searchParams?: Promise<{ success?: string }>;
};

function getCustomerSuccessMessage(success?: string) {
  switch (success) {
    case "order_submitted_ecu":
      return "ECU tuning request submitted successfully.";
    case "order_submitted_tcu":
      return "TCU tuning request submitted successfully.";
    case "order_submitted_ecu_tcu":
      return "ECU + TCU tuning request submitted successfully.";
    case "payment_uploaded":
      return "Payment slip uploaded successfully.";
    case "payment_replaced":
      return "Payment slip replaced successfully.";
    case "order_cancelled":
      return "Order cancelled successfully.";
    default:
      return null;
  }
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
        Success
      </div>
      <p className="mt-2 text-sm leading-6">{message}</p>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");

  const params = (await searchParams) || {};
  const successMessage = getCustomerSuccessMessage(params.success);

  const orders = await getRecentOrdersForUser(user.id);

  return (
    <section className="section-pad">
      <ClearSuccessParam />
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Customer Dashboard</h1>

        {successMessage ? <SuccessBanner message={successMessage} /> : null}

        <div className="mt-8">
          <OrderTable orders={orders} />
        </div>
      </div>
    </section>
  );
}
