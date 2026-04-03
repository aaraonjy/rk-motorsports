import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable } from "@/components/order-table";
import { ClearSuccessParam } from "@/components/clear-success-param";

type AdminPageProps = {
  searchParams?: Promise<{ success?: string }>;
};

function getAdminSuccessMessage(success?: string) {
  switch (success) {
    case "tuned_ecu_uploaded":
      return "Tuned ECU file uploaded successfully.";
    case "order_released":
      return "Download released successfully.";
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

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const successMessage = getAdminSuccessMessage(params.success);

  const orders = await getAllOrders({});

  return (
    <section className="section-pad">
      <ClearSuccessParam />
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>

        {successMessage ? <SuccessBanner message={successMessage} /> : null}

        <div className="mt-8">
          <OrderTable orders={orders} admin />
        </div>
      </div>
    </section>
  );
}
