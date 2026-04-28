import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSalesInvoiceClient } from "@/components/admin-sales-invoice-client";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sumLinkedQty(
  line: {
    sourceLineLinks?: Array<{ linkType?: string | null; qty?: unknown; claimAmount?: unknown; targetTransaction?: { status?: string | null } | null }>;
  },
  linkType: "INVOICED_TO" | "INVOICED_TO"
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}


function sumLinkedAmount(
  line: {
    sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: unknown; targetTransaction?: { status?: string | null } | null }>;
  },
  linkType: "INVOICED_TO" | "INVOICED_TO"
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
}

export default async function AdminSalesInvoicePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [customers, products, locations, agents, projects, departments, stockConfig, taxConfig, taxCodes, salesOrders] = await Promise.all([
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
      where: { isActive: true, OR: [{ trackInventory: true }, { itemType: "SERVICE_ITEM" }] },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        baseUom: true,
        sellingPrice: true,
        itemType: true,
        batchTracking: true,
        serialNumberTracking: true,
        isAssemblyItem: true,
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
    db.taxConfiguration.findUnique({
      where: { id: "default" },
      include: { defaultAdminTaxCode: true },
    }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, description: true, rate: true, calculationMethod: true },
    }),
    db.salesTransaction.findMany({
      where: { docType: { in: ["DO", "SO"] }, status: { not: "CANCELLED" } },
      orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            inventoryProduct: { select: { itemType: true } },
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
        <AdminSalesInvoiceClient
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
              const itemType = line.inventoryProduct?.itemType || "STOCK_ITEM";
              const invoicedQty = sumLinkedQty(line, "INVOICED_TO");
              const remainingInvoiceQty = Math.max(0, toNumber(line.qty) - invoicedQty);
              const orderedAmount = toNumber(line.lineTotal);
              const invoicedAmount = sumLinkedAmount(line, "INVOICED_TO");
              const remainingInvoiceAmount = Math.max(0, orderedAmount - invoicedAmount);
              return {
                id: line.id,
                inventoryProductId: line.inventoryProductId,
                productCode: line.productCode,
                productDescription: line.productDescription,
                itemType,
                uom: line.uom,
                qty: Number(line.qty ?? 0),
                invoicedQty,
                remainingInvoiceQty,
                orderedAmount,
                invoicedAmount,
                remainingInvoiceAmount,
                unitPrice: Number(line.unitPrice ?? 0),
                discountRate: Number(line.discountRate ?? 0),
                discountType: line.discountType,
                locationId: line.locationId,
                taxCodeId: line.taxCodeId,
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
            itemType: product.itemType,
            batchTracking: Boolean(product.batchTracking),
            serialNumberTracking: Boolean(product.serialNumberTracking),
            isAssemblyItem: Boolean(product.isAssemblyItem),
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
            taxCalculationMode: (taxConfig?.taxCalculationMode || "TRANSACTION") as any,
            defaultAdminTaxCodeId: taxConfig?.defaultAdminTaxCodeId || "",
            taxCodes: taxCodes.map((taxCode) => ({
              id: taxCode.id,
              code: taxCode.code,
              description: taxCode.description,
              rate: Number(taxCode.rate ?? 0),
              calculationMethod: taxCode.calculationMethod as any,
            })),
          }}
        />
      </div>
    </section>
  );
}
