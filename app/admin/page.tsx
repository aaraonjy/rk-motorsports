import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable, type OrderWithRelations } from "@/components/order-table";

type AdminPageProps = {
  searchParams?: Promise<{
    status?: string;
    search?: string;
    success?: string;
  }>;
};

function getAdminSuccessMessage(success?: string) {
  switch (success) {
    case "tuned_ecu_uploaded":
      return "Tuned ECU file uploaded successfully.";
    case "tuned_tcu_uploaded":
      return "Tuned TCU file uploaded successfully.";
    case "tuned_files_uploaded":
      return "Tuned ECU and TCU files uploaded successfully.";
    case "revision_ecu_uploaded":
      return "ECU revision file uploaded successfully.";
    case "revision_tcu_uploaded":
      return "TCU revision file uploaded successfully.";
    case "revision_files_uploaded":
      return "ECU and TCU revision files uploaded successfully.";
    case "order_released":
      return "Download released successfully.";
    case "admin_order_cancelled":
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

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) || {};
  const status = params.status || "ALL";
  const search = params.search || "";
  const successMessage = getAdminSuccessMessage(params.success);

  const orders = (await getAllOrders({
    status,
    search,
  })) as OrderWithRelations[];

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <p className="mt-4 text-white/70">
          Review ECU / TCU orders, uploaded files, and manage delivery workflow.
        </p>

        {successMessage ? <SuccessBanner message={successMessage} /> : null}

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Search by order number or filter by status to manage customer
              orders more efficiently.
            </p>
          </div>

          <form
            method="get"
            className="card-rk grid gap-4 p-6 md:grid-cols-[1fr_220px_auto]"
          >
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Search Order Number
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="e.g. RK-20260328-2017"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Filter Status
              </label>
              <div className="relative">
                <select
                  name="status"
                  defaultValue={status}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="FILE_RECEIVED">File Received</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="AWAITING_PAYMENT">Awaiting Payment</option>
                  <option value="PAID">Paid</option>
                  <option value="READY_FOR_DOWNLOAD">Ready for Download</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>

                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 hover:bg-white/10"
              >
                Apply
              </button>
              <a
                href="/admin"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white/70 hover:bg-white/10"
              >
                Reset
              </a>
            </div>
          </form>

          <OrderTable orders={orders} admin />
        </div>
      </div>
    </section>
  );
}
