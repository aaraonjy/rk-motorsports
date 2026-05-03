import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminPurchaseTransactionClient } from "@/components/purchase/admin-purchase-transaction-client";
import { loadPurchaseSources } from "@/lib/purchase";
import type { PurchaseDocType } from "@prisma/client";

function toNumber(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
async function loadSharedData(docType: PurchaseDocType) {
  const [suppliers, products, locations, agents, projects, departments, stockConfig, taxConfig, taxCodes, transactions, sourceDocuments] = await Promise.all([
    db.supplier.findMany({ where: { isActive: true }, orderBy: [{ supplierAccountNo: "asc" }, { name: "asc" }], select: { id: true, name: true, supplierAccountNo: true, email: true, phone: true, billingAddressLine1: true, billingAddressLine2: true, billingAddressLine3: true, billingAddressLine4: true, billingCity: true, billingPostCode: true, billingCountryCode: true, deliveryAddressLine1: true, deliveryAddressLine2: true, deliveryAddressLine3: true, deliveryAddressLine4: true, deliveryCity: true, deliveryPostCode: true, deliveryCountryCode: true, attention: true, currency: true, agentId: true } }),
    db.inventoryProduct.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, description: true, baseUom: true, unitCost: true, itemType: true, batchTracking: true, serialNumberTracking: true, isAssemblyItem: true, uomConversions: { select: { id: true, uomCode: true, conversionRate: true }, orderBy: [{ uomCode: "asc" }] } } }),
    db.stockLocation.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.agent.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.project.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, isActive: true } }),
    db.department.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, name: true, projectId: true, isActive: true } }),
    db.stockConfiguration.findUnique({ where: { id: "default" }, select: { defaultLocationId: true, enableProject: true, enableDepartment: true } }),
    db.taxConfiguration.findUnique({ where: { id: "default" }, select: { taxModuleEnabled: true, taxCalculationMode: true, defaultAdminTaxCodeId: true } }),
    db.taxCode.findMany({ where: { isActive: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, description: true, rate: true, calculationMethod: true } }),
    db.purchaseTransaction.findMany({ where: { docType }, include: { lines: { orderBy: { lineNo: "asc" } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    loadPurchaseSources(docType),
  ]);

  return {
    suppliers,
    products: products.map((p) => ({ ...p, unitCost: toNumber(p.unitCost), uomConversions: p.uomConversions.map((u) => ({ ...u, conversionRate: toNumber(u.conversionRate) })) })),
    locations,
    agents,
    projects,
    departments,
    defaultLocationId: stockConfig?.defaultLocationId || locations[0]?.id || "",
    projectFeatureEnabled: Boolean(stockConfig?.enableProject),
    departmentFeatureEnabled: Boolean(stockConfig?.enableDepartment),
    taxConfig: { taxModuleEnabled: Boolean(taxConfig?.taxModuleEnabled), taxCalculationMode: (taxConfig?.taxCalculationMode || "TRANSACTION") as any, defaultAdminTaxCodeId: taxConfig?.defaultAdminTaxCodeId || null, taxCodes: taxCodes.map((tax) => ({ ...tax, rate: toNumber(tax.rate) })) },
    transactions: transactions.map((tx) => ({ ...tx, docDate: tx.docDate.toISOString(), grandTotal: toNumber(tx.grandTotal), lines: tx.lines.map((line) => ({ ...line, qty: toNumber(line.qty), unitCost: toNumber(line.unitCost), remainingQty: toNumber(line.qty) })) })),
    sourceDocuments: sourceDocuments.map((tx: any) => ({ ...tx, docDate: tx.docDate.toISOString(), grandTotal: toNumber(tx.grandTotal), lines: tx.lines.map((line: any) => ({ ...line, qty: toNumber(line.qty), unitCost: toNumber(line.unitCost), remainingQty: toNumber(line.remainingQty) })) })),
  };
}

export default async function AdminPIPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");
  const data = await loadSharedData("PI" as PurchaseDocType);
  return <section className="section-pad"><div className="container-rk"><h1 className="text-4xl font-bold">Purchase Invoice</h1><p className="mt-4 text-white/70">Record purchase amount. Direct PI stocks in; PI generated from GRN does not stock in again.</p><div className="mt-8"><AdminPurchaseTransactionClient docType="PI" title="Purchase Invoice" description="Record purchase amount. Direct PI stocks in; PI generated from GRN does not stock in again." apiPath="/api/admin/purchase/purchase-invoice" initialTransactions={data.transactions as any} sourceDocuments={data.sourceDocuments as any} suppliers={data.suppliers as any} products={data.products as any} locations={data.locations} agents={data.agents} projects={data.projects} departments={data.departments} defaultLocationId={data.defaultLocationId} projectFeatureEnabled={data.projectFeatureEnabled} departmentFeatureEnabled={data.departmentFeatureEnabled} taxConfig={data.taxConfig} /></div></div></section>;
}
