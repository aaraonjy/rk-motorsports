import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminDeliveryOrderClient } from "@/components/admin-delivery-order-client";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sumLinkedQty(
  line: {
    sourceLineLinks?: Array<{ linkType?: string | null; qty?: unknown; targetTransaction?: { status?: string | null } | null }>;
  },
  linkType: "DELIVERED_TO" | "INVOICED_TO"
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}

export default async function AdminDeliveryOrderPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [customers, products, locations, agents, projects, departments, stockConfig, salesOrders] = await Promise.all([
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
        deliveryAddresses: {
          select: {
            id: true,
            label: true,
            addressLine1: true,
            addressLine2: true,
            addressLine3: true,
            addressLine4: true,
            city: true,
            postCode: true,
            countryCode: true,
          },
          orderBy: [{ createdAt: "asc" }],
        },
        attention: true,
        currency: true,
        agentId: true,
      },
    }),
    db.inventoryProduct.findMany({
      where: { isActive: true, trackInventory: true },
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
    db.salesTransaction.findMany({
      where: { docType: "SO", status: { not: "CANCELLED" } },
      orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            sourceLineLinks: {
              include: {
                targetTransaction: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <AdminDeliveryOrderClient
          initialSalesOrders={salesOrders.map((order) => ({
            id: order.id,
            docNo: order.docNo,
            docDate: order.docDate.toISOString(),
            docDesc: order.docDesc,
            customerId: order.customerId,
            customerName: order.customerName,
            customerAccountNo: order.customerAccountNo,
            billingAddressLine1: order.billingAddressLine1,
            billingAddressLine2: order.billingAddressLine2,
            billingAddressLine3: order.billingAddressLine3,
            billingAddressLine4: order.billingAddressLine4,
            billingCity: order.billingCity,
            billingPostCode: order.billingPostCode,
            billingCountryCode: order.billingCountryCode,
            deliveryAddressLine1: order.deliveryAddressLine1,
            deliveryAddressLine2: order.deliveryAddressLine2,
            deliveryAddressLine3: order.deliveryAddressLine3,
            deliveryAddressLine4: order.deliveryAddressLine4,
            deliveryCity: order.deliveryCity,
            deliveryPostCode: order.deliveryPostCode,
            deliveryCountryCode: order.deliveryCountryCode,
            attention: order.attention,
            contactNo: order.contactNo,
            email: order.email,
            currency: order.currency,
            reference: order.reference,
            remarks: order.remarks,
            agentId: order.agentId,
            projectId: order.projectId,
            departmentId: order.departmentId,
            termsAndConditions: order.termsAndConditions,
            bankAccount: order.bankAccount,
            footerRemarks: order.footerRemarks,
            status: order.status,
            grandTotal: Number(order.grandTotal ?? 0),
            lines: order.lines.map((line) => {
              const deliveredQty = sumLinkedQty(line, "DELIVERED_TO");
              const remainingDeliveryQty = Math.max(0, toNumber(line.qty) - deliveredQty);
              return {
                id: line.id,
                inventoryProductId: line.inventoryProductId,
                productCode: line.productCode,
                productDescription: line.productDescription,
                uom: line.uom,
                qty: Number(line.qty ?? 0),
                deliveredQty,
                remainingDeliveryQty,
                unitPrice: Number(line.unitPrice ?? 0),
                discountRate: Number(line.discountRate ?? 0),
                discountType: line.discountType,
                locationId: line.locationId,
                remarks: line.remarks,
              };
            }),
          }))}
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
        />
      </div>
    </section>
  );
}
