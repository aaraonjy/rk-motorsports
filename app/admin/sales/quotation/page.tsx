import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSalesQuotationClient } from "@/components/admin-sales-quotation-client";

export default async function AdminSalesQuotationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [customers, products, agents, projects, departments, stockConfig] = await Promise.all([
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
      select: { id: true, code: true, description: true, baseUom: true, sellingPrice: true },
    }),
    db.agent.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.project.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.department.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, projectId: true, isActive: true } }),
    db.stockConfiguration.findUnique({ where: { id: "default" } }),
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
          }))}
          initialAgents={agents}
          initialProjects={projects}
          initialDepartments={departments}
          projectFeatureEnabled={Boolean(stockConfig?.enableProject)}
          departmentFeatureEnabled={Boolean(stockConfig?.enableProject && stockConfig?.enableDepartment)}
        />
      </div>
    </section>
  );
}
