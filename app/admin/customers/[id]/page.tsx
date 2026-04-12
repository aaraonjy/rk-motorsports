import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getCustomerByIdWithIntelligence } from "@/lib/queries";
import { redirect, notFound } from "next/navigation";

type DecimalLike = {
  toNumber?: () => number;
  toString?: () => string;
};

function toSafeNumber(value: unknown) {
  if (typeof value === "number") return value;

  if (value && typeof value === "object") {
    const maybeDecimal = value as DecimalLike;

    if (typeof maybeDecimal.toNumber === "function") {
      const converted = maybeDecimal.toNumber();
      return Number.isFinite(converted) ? converted : 0;
    }

    if (typeof maybeDecimal.toString === "function") {
      const converted = Number(maybeDecimal.toString());
      return Number.isFinite(converted) ? converted : 0;
    }
  }

  const converted = Number(value);
  return Number.isFinite(converted) ? converted : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatRelativeDate(value: Date | null) {
  if (!value) return "-";

  const now = Date.now();
  const then = value.getTime();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatDateTime(value);
}

function getOrderTitle(order: {
  orderType: "STANDARD_TUNING" | "CUSTOM_ORDER";
  customTitle: string | null;
  selectedTuneLabel: string | null;
  tuningType: string;
}) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customTitle || "Custom Order";
  }

  return order.selectedTuneLabel || `${order.tuningType} Tune`;
}

function getOrderDisplayAmount(order: {
  orderType: "STANDARD_TUNING" | "CUSTOM_ORDER";
  totalAmount: unknown;
  customGrandTotal: unknown;
}) {
  return order.orderType === "CUSTOM_ORDER"
    ? toSafeNumber(order.customGrandTotal)
    : toSafeNumber(order.totalAmount);
}

function getCustomerProfileDisplayStatus(order: {
  createdByAdminId: string | null;
  status: string;
}) {
  if (order.createdByAdminId && order.status !== "COMPLETED" && order.status !== "CANCELLED") {
    return "FILE_RECEIVED";
  }

  return order.status;
}

function getStatusClasses(status: string) {
  switch (status) {
    case "READY_FOR_DOWNLOAD":
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "CANCELLED":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "IN_PROGRESS":
      return "border-violet-500/30 bg-violet-500/10 text-violet-300";
    case "FILE_RECEIVED":
    case "RECEIVED":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    case "AWAITING_PAYMENT":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "PAID":
      return "border-cyan-500/30 bg-cyan-500/15 text-cyan-300";
    default:
      return "border-white/15 bg-white/5 text-white/75";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "FILE_RECEIVED":
    case "RECEIVED":
      return "Received";
    case "IN_PROGRESS":
      return "In Progress";
    case "AWAITING_PAYMENT":
      return "Pending Payment";
    case "READY_FOR_DOWNLOAD":
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PAID":
      return "Paid";
    default:
      return status.replaceAll("_", " ");
  }
}

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const customer = await getCustomerByIdWithIntelligence(id);

  if (!customer) {
    notFound();
  }

  return (
    <section className="section-pad">
      <div className="container-rk space-y-8">
        <div className="flex flex-col gap-4">
          <div>
            <Link
              href="/admin/customers"
              className="text-sm text-white/50 transition hover:text-white/80"
            >
              ← Back to Customers
            </Link>
            <h1 className="mt-3 text-4xl font-bold">{customer.name}</h1>
            <p className="mt-3 text-white/70">
              Manage customer details, orders, and tuning records in one place.
            </p>
          </div>
        </div>

        <div className="card-rk p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Customer Information
              </p>
              <div className="mt-4 space-y-2 text-sm text-white/75">
                <p>
                  <span className="text-white/45">Email:</span> {customer.email}
                </p>
                <p>
                  <span className="text-white/45">Phone:</span> {customer.phone || "-"}
                </p>
                <p>
                  <span className="text-white/45">Account Source:</span>{" "}
                  {customer.accountSource === "ADMIN" ? "Admin Created" : "Self Registered"}
                </p>
                <p>
                  <span className="text-white/45">Portal Access:</span>{" "}
                  {customer.portalAccess ? "Enabled" : "Disabled"}
                </p>
                <p>
                  <span className="text-white/45">Created Date:</span>{" "}
                  {formatDateTime(customer.createdAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Total Orders</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {customer.intelligence.totalOrders}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Total Spent</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {formatCurrency(customer.intelligence.totalSpent)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Avg Order Value</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {formatCurrency(customer.intelligence.averageOrderValue)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-white/45">Last Order</p>
              <p className="mt-3 text-2xl font-bold text-white">
                {formatRelativeDate(customer.intelligence.lastOrderDate)}
              </p>
            </div>
          </div>
        </div>

        <div className="card-rk overflow-hidden">
          <div className="border-b border-white/10 px-6 py-5 md:px-8">
            <h2 className="text-2xl font-semibold text-white">Order History</h2>
            <p className="mt-2 text-sm text-white/60">
              Review all orders placed under this customer profile.
            </p>
          </div>

          {customer.orders.length === 0 ? (
            <div className="px-6 py-12 text-center text-white/55 md:px-8">
              No orders found for this customer yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-white/80">
                <thead className="bg-black/30 text-white/50">
                  <tr>
                    <th className="px-6 py-4 font-medium md:px-8">Order No.</th>
                    <th className="px-6 py-4 font-medium">Title</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.orders.map((order) => {
                    const displayStatus = getCustomerProfileDisplayStatus(order);

                    return (
                      <tr key={order.id} className="border-t border-white/10 align-top">
                        <td className="px-6 py-5 md:px-8">
                          <div className="font-medium text-white">{order.orderNumber}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-medium text-white">{getOrderTitle(order)}</div>
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {order.orderType === "CUSTOM_ORDER" ? "Custom Order" : "Standard Tuning"}
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
                              displayStatus
                            )}`}
                          >
                            {getStatusLabel(displayStatus)}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-medium text-white">
                          {formatCurrency(getOrderDisplayAmount(order))}
                        </td>
                        <td className="px-6 py-5 text-white/65">
                          {formatDateTime(order.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
