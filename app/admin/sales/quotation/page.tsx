import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSalesQuotationClient } from "@/components/admin-sales-quotation-client";

export default async function AdminSalesQuotationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [customers, products, locations, agents, projects, departments, stockConfig, taxConfig, taxCodes] = await Promise.all([
    db.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: [{ customerAccountNo: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        customerAccountNo: true,
        billingAddressLine1: true,
        billingAddressLine2: true,
        billingAddressLine3: true,
        billingAddressLine4: true,
        billingCity: true,
        billingPostCode: true,
        billingCountryCode: true,
        deliveryAddressLine1: true,
        deliveryAddressLine2: true,
        deliveryAddressLine3: true,
        deliveryAddressLine4: true,
        deliveryCity: true,
        deliveryPostCode: true,
        deliveryCountryCode: true,
        attention: true,
        currency: true,
        agentId: true,
      },
    }),
    db.inventoryProduct.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        baseUom: true,
        sellingPrice: true,
        batchTracking: true,
        serialNumberTracking: true,
        uomConversions: {
          select: { id: true, uomCode: true, conversionRate: true },
          orderBy: [{ uomCode: "asc" }],
        },
      },
    }),
    db.stockLocation.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.agent.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.project.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.department.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, projectId: true, isActive: true } }),
    db.stockConfiguration.findUnique({ where: { id: "default" } }),
    db.taxConfiguration.findUnique({ where: { id: "default" } }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        rate: true,
        calculationMethod: true,
      },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <AdminSalesQuotationClient
          initialCustomers={customers}
          initialProducts={products.map((product) => ({
            id: product.id,
            code: product.code,
            description: product.description,
            baseUom: product.baseUom,
            sellingPrice: Number(product.sellingPrice ?? 0),
            batchTracking: Boolean(product.batchTracking),
            serialNumberTracking: Boolean(product.serialNumberTracking),
            uomConversions: product.uomConversions.map((item) => ({
              id: item.id,
              uomCode: item.uomCode,
              conversionRate: Number(item.conversionRate ?? 0),
            })),
          }))}
          initialLocations={locations}
          defaultLocationId={stockConfig?.defaultLocationId ?? ""}
          initialAgents={agents}
          initialProjects={projects}
          initialDepartments={departments}
          projectFeatureEnabled={Boolean(stockConfig?.enableProject)}
          departmentFeatureEnabled={Boolean(stockConfig?.enableProject && stockConfig?.enableDepartment)}
          stockNumberFormat={{
            qtyDecimalPlaces: Number(stockConfig?.qtyDecimalPlaces ?? 2),
            unitCostDecimalPlaces: Number(stockConfig?.unitCostDecimalPlaces ?? 2),
            priceDecimalPlaces: Number(stockConfig?.priceDecimalPlaces ?? 2),
          }}
          taxConfig={{
            taxModuleEnabled: Boolean(taxConfig?.taxModuleEnabled),
            taxCalculationMode: taxConfig?.taxCalculationMode ?? "TRANSACTION",
            defaultAdminTaxCodeId: taxConfig?.defaultAdminTaxCodeId ?? "",
            taxCodes: taxCodes.map((taxCode) => ({
              id: taxCode.id,
              code: taxCode.code,
              description: taxCode.description,
              rate: Number(taxCode.rate ?? 0),
              calculationMethod: taxCode.calculationMethod,
            })),
          }}
        />
      </div>
    </section>
  );
}
