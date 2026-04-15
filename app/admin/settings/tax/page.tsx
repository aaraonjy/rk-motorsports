import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AdminTaxConfigurationClient } from "@/components/admin-tax-configuration-client";

export default async function TaxConfigurationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [config, taxCodes] = await Promise.all([
    db.taxConfiguration.findUnique({
      where: { id: "default" },
      include: {
        defaultPortalTaxCode: true,
        defaultAdminTaxCode: true,
      },
    }),
    db.taxCode.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Global Settings</p>
            <h1 className="mt-3 text-4xl font-bold">Tax Configuration</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Configure the tax module foundation, default portal/admin tax codes, and the tax code master list for future order integration.
            </p>
          </div>
        </div>

        <AdminTaxConfigurationClient
          initialConfig={{
            taxModuleEnabled: config?.taxModuleEnabled ?? false,
            taxCalculationMode: config?.taxCalculationMode ?? "TRANSACTION",
            defaultPortalTaxCodeId: config?.defaultPortalTaxCodeId ?? "",
            defaultAdminTaxCodeId: config?.defaultAdminTaxCodeId ?? "",
          }}
          taxCodes={taxCodes.map((taxCode) => ({
            id: taxCode.id,
            code: taxCode.code,
            description: taxCode.description,
            taxType: taxCode.taxType,
            rate: Number(taxCode.rate),
            calculationMethod: taxCode.calculationMethod,
            isActive: taxCode.isActive,
          }))}
        />
      </div>
    </section>
  );
}
