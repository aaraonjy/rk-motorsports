import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminStockConfigurationClient } from "@/components/admin-stock-configuration-client";
import {
  DEFAULT_STOCK_NUMBER_FORMAT_CONFIG,
  normalizeMoneyDecimalPlaces,
  normalizeQtyDecimalPlaces,
} from "@/lib/stock-format";

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
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Global Settings</p>
            <h1 className="mt-3 text-4xl font-bold">Stock Settings</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Configure stock numbering, input precision, and document number override permissions.
            </p>
          </div>
        </div>

        <div className="mt-10">
          <AdminStockConfigurationClient
            initialConfig={{
              stockModuleEnabled: config?.stockModuleEnabled ?? false,
              multiLocationEnabled: config?.multiLocationEnabled ?? false,
              allowNegativeStock: config?.allowNegativeStock ?? false,
              enableProject: config?.enableProject ?? false,
              enableDepartment: config?.enableDepartment ?? false,
              costingMethod: config?.costingMethod ?? "AVERAGE",
              defaultLocationId: config?.defaultLocationId ?? "",
              qtyDecimalPlaces: normalizeQtyDecimalPlaces(
                config?.qtyDecimalPlaces ?? DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.qtyDecimalPlaces
              ),
              unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(
                config?.unitCostDecimalPlaces ?? DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.unitCostDecimalPlaces
              ),
              priceDecimalPlaces: normalizeMoneyDecimalPlaces(
                config?.priceDecimalPlaces ?? DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.priceDecimalPlaces
              ),
              allowDocNoOverrideOB: config?.allowDocNoOverrideOB ?? false,
              allowDocNoOverrideSR: config?.allowDocNoOverrideSR ?? false,
              allowDocNoOverrideSI: config?.allowDocNoOverrideSI ?? false,
              allowDocNoOverrideSA: config?.allowDocNoOverrideSA ?? false,
              allowDocNoOverrideST: config?.allowDocNoOverrideST ?? false,
              allowDocNoOverrideAS: config?.allowDocNoOverrideAS ?? false,
            }}
            locations={locations}
          />
        </div>
      </div>
    </section>
  );
}
