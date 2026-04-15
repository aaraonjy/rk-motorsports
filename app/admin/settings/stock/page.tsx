import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockConfigurationClient } from "@/components/admin-stock-configuration-client";

export default async function AdminStockSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [config, locations] = await Promise.all([
    db.stockConfiguration.findUnique({ where: { id: "default" } }),
    db.stockLocation.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Batch A</p>
            <h1 className="mt-3 text-4xl font-bold">Stock Settings</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Configure the stock module foundation without affecting current order logic or stock movement yet.
            </p>
          </div>
        </div>

        <div className="mt-10">
          <AdminStockConfigurationClient
            initialConfig={{
              stockModuleEnabled: config?.stockModuleEnabled ?? false,
              multiLocationEnabled: config?.multiLocationEnabled ?? false,
              allowNegativeStock: config?.allowNegativeStock ?? false,
              costingMethod: config?.costingMethod ?? "AVERAGE",
              multiUomEnabled: config?.multiUomEnabled ?? false,
              serialTrackingEnabled: config?.serialTrackingEnabled ?? false,
              defaultLocationId: config?.defaultLocationId ?? locations.find((item) => item.isActive)?.id ?? "",
            }}
            locations={locations}
          />
        </div>
      </div>
    </section>
  );
}
