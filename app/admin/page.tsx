import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OrderTable, type OrderWithRelations } from "@/components/order-table";
import { ClearSuccessParam } from "@/components/clear-success-param";
import { PaginationControls } from "@/components/pagination-controls";

type AdminPageProps = {
  searchParams?: Promise<{
    status?: string;
    search?: string;
    customerKeyword?: string;
    tuningType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    success?: string;
  }>;
};

type BannerState =
  | {
      tone: "success" | "cancelled";
      title: string;
      message: string;
    }
  | null;

function getAdminBanner(success?: string): BannerState {
  switch (success) {
    case "tuned_ecu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "Tuned ECU file uploaded successfully.",
      };
    case "tuned_tcu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "Tuned TCU file uploaded successfully.",
      };
    case "tuned_files_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "Tuned ECU and TCU files uploaded successfully.",
      };
    case "revision_ecu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "ECU revision file uploaded successfully.",
      };
    case "revision_tcu_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "TCU revision file uploaded successfully.",
      };
    case "revision_files_uploaded":
      return {
        tone: "success",
        title: "Success",
        message: "ECU and TCU revision files uploaded successfully.",
      };
    case "order_released":
      return {
        tone: "success",
        title: "Success",
        message: "Download released successfully.",
      };
    case "admin_order_cancelled":
      return {
        tone: "cancelled",
        title: "Cancelled",
        message: "Order cancelled successfully.",
      };
    default:
      return null;
  }
}

function Banner({ data }: { data: NonNullable<BannerState> }) {
  const toneClass =
    data.tone === "cancelled"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

  const eyebrowClass =
    data.tone === "cancelled"
      ? "text-red-300/80"
      : "text-emerald-300/80";

  return (
    <div className={`mt-6 rounded-2xl border p-4 ${toneClass}`}>
      <div
        className={`text-sm font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}
      >
        {data.title}
      </div>
      <p className="mt-2 text-sm leading-6">{data.message}</p>
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
  const customerKeyword = params.customerKeyword || "";
  const tuningType = params.tuningType || "ALL";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";
  const page = Math.max(1, Number(params.page || "1") || 1);
  const banner = getAdminBanner(params.success);

  const result = (await getAllOrders({
    status,
    search,
    customerKeyword,
    tuningType,
    dateFrom,
    dateTo,
    page,
    pageSize: 5,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  return (
    <section className="section-pad">
      <ClearSuccessParam />
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <p className="mt-4 text-white/70">
          Review ECU / TCU orders, uploaded files, and manage delivery workflow.
        </p>

        {banner ? <Banner data={banner} /> : null}

        <div className="mt-8 space-y-4">
          <div className="card-rk p-6 text-white/75">
            <p>
              Search by order number, customer name, phone number, email, status,
              tuning type, or date range to manage customer orders more efficiently.
            </p>
          </div>

          <form method="get" className="card-rk grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm text-white/65">
                Search Order Number
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search order number"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Customer Name / Phone Number / Email
              </label>
              <input
                type="text"
                name="customerKeyword"
                defaultValue={customerKeyword}
                placeholder="Search name, phone, or email"
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

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Tuning Type
              </label>
              <div className="relative">
                <select
                  name="tuningType"
                  defaultValue={tuningType}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 pr-12 text-white outline-none"
                >
                  <option value="ALL">All Tuning Types</option>
                  <option value="ECU">ECU</option>
                  <option value="TCU">TCU</option>
                  <option value="ECU_TCU">ECU + TCU</option>
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

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Date From
              </label>
              <input
                type="date"
                name="dateFrom"
                defaultValue={dateFrom}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/65">
                Date To
              </label>
              <input
                type="date"
                name="dateTo"
                defaultValue={dateTo}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white outline-none"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="page" value="1" />
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

          <OrderTable orders={result.orders} admin />

          <PaginationControls
            currentPage={result.currentPage}
            totalPages={result.totalPages}
            basePath="/admin"
            params={{
              status: status !== "ALL" ? status : undefined,
              search: search || undefined,
              customerKeyword: customerKeyword || undefined,
              tuningType: tuningType !== "ALL" ? tuningType : undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              success: params.success,
            }}
          />
        </div>
      </div>
    </section>
  );
}