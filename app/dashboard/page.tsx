import { getSessionUser } from "@/lib/auth";
import { getRecentOrdersForUser } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable } from "@/components/order-table";
import { paymentConfig } from "@/lib/payment-config";

type DashboardPageProps = {
  searchParams?: Promise<{
    success?: string;
  }>;
};

function getCustomerSuccessMessage(success?: string) {
  switch (success) {
    case "order_submitted_ecu":
      return "ECU tuning request submitted successfully. Your order has been received and is now under review.";
    case "order_submitted_tcu":
      return "TCU tuning request submitted successfully. Your order has been received and is now under review.";
    case "order_submitted_ecu_tcu":
      return "ECU + TCU tuning request submitted successfully. Your order has been received and is now under review.";
    case "payment_uploaded":
      return "Payment slip uploaded successfully. Our admin will review it before releasing your file(s).";
    case "payment_replaced":
      return "Payment slip replaced successfully. Our admin will review the updated slip before releasing your file(s).";
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

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");

  const params = (await searchParams) || {};
  const successMessage = getCustomerSuccessMessage(params.success);

  const orders = await getRecentOrdersForUser(user.id);

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Customer Dashboard</h1>
        <p className="mt-4 text-white/70">
          Track ECU / TCU order status and download completed tuned files.
        </p>

        {successMessage ? <SuccessBanner message={successMessage} /> : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="card-rk p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold">Payment Instructions</h2>
            <p className="mt-2 text-white/70">
              For orders marked as pending payment, please complete your bank
              transfer and upload your payment slip for verification.
            </p>

            <div className="mt-4 grid gap-4 text-sm text-white/85 sm:grid-cols-2">
              <div>
                <div className="text-white/55">Bank Name</div>
                <div className="font-medium">{paymentConfig.bankName}</div>
              </div>
              <div>
                <div className="text-white/55">Account Name</div>
                <div className="font-medium">{paymentConfig.accountName}</div>
              </div>
              <div>
                <div className="text-white/55">Account Number</div>
                <div className="font-medium">{paymentConfig.accountNumber}</div>
              </div>
              <div>
                <div className="text-white/55">Order Reference</div>
                <div className="font-medium">
                  Please include your order number in the transfer reference.
                </div>
              </div>
            </div>

            <div className="mt-5">
              <a
                href={`https://wa.me/${paymentConfig.whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-emerald-500/40 px-4 py-2 text-emerald-400 hover:bg-emerald-500/10"
              >
                Contact via WhatsApp
              </a>
            </div>
          </div>

          <div className="card-rk p-6">
            <h2 className="text-xl font-semibold">Payment Reminder</h2>
            <p className="mt-2 text-sm text-white/70">
              After payment, upload your transfer slip from the order row marked
              as pending payment. Our admin will verify it before releasing your
              tuned file(s).
            </p>
          </div>
        </div>

        <div className="mt-8">
          <OrderTable orders={orders} />
        </div>
      </div>
    </section>
  );
}
