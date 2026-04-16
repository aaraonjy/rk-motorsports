import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockLocationClient } from "@/components/admin-stock-location-client";

export default async function AdminStockLocationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const locations = await db.stockLocation.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Batch B</p>
            <h1 className="mt-3 text-4xl font-bold">Stock Location</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Manage stock locations for default stock posting, multi-location transfer, and future stock transaction flows.
            </p>
          </div>
        </div>

        <div className="mt-10">
          <AdminStockLocationClient
            initialItems={locations.map((item) => ({
              ...item,
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            }))}
          />
        </div>
      </div>
    </section>
  );
}
