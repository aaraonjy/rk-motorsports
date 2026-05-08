import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminPurchaseReturnClient } from "@/components/purchase/admin-purchase-return-client";
import { loadPurchaseSources } from "@/lib/purchase";
import type { PurchaseDocType } from "@prisma/client";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isActiveLinkedPurchaseTransaction(transaction: {
  status?: string | null;
  revisions?: Array<{ status?: string | null }> | null;
} | null | undefined) {
  if (!transaction) return false;
  if (String(transaction.status || "").toUpperCase() === "CANCELLED") return false;
  return (transaction.revisions || []).length === 0;
}

function sumLinkedQty(
  line: {
    sourceLineLinks?: Array<{
      linkType?: string | null;
      qty?: unknown;
      targetTransaction?: { status?: string | null; revisions?: Array<{ status?: string | null }> | null } | null;
    }>;
  },
  linkType: "RECEIVED_TO" | "INVOICED_TO",
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => isActiveLinkedPurchaseTransaction(link.targetTransaction))
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}

function sumLinkedAmount(
  line: {
    sourceLineLinks?: Array<{
      linkType?: string | null;
      claimAmount?: unknown;
      targetTransaction?: { status?: string | null; revisions?: Array<{ status?: string | null }> | null } | null;
    }>;
  },
  linkType: "RECEIVED_TO" | "INVOICED_TO",
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => isActiveLinkedPurchaseTransaction(link.targetTransaction))
    .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
}


type PurchaseTrackingMeta = {
  batchNo: string | null;
  expiryDate: string | null;
  serialNos: string[];
};

function normalizeTrackingText(value: unknown) {
  return String(value || "").trim();
}

function normalizeTrackingKey(value: unknown) {
  return normalizeTrackingText(value).toUpperCase();
}

function uniqueTrackingSerialNos(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = normalizeTrackingText(value);
    if (!text) continue;
    const key = text.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function formatTrackingDateInput(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function getRevisionBaseDocNo(docNo: string | null | undefined) {
  const value = normalizeTrackingText(docNo).toUpperCase();
  const match = value.match(/^(.+-\d{4})(?:-\d+)?$/);
  return match ? match[1] : value;
}

function findMatchingStockTrackingLine(
  stockLines: Array<{
    inventoryProductId?: string | null;
    locationId?: string | null;
    batchNo?: string | null;
    expiryDate?: Date | string | null;
    serialEntries?: Array<{ serialNo?: string | null }>;
  }>,
  line: {
    inventoryProductId?: string | null;
    locationId?: string | null;
    batchNo?: string | null;
  },
) {
  const productId = normalizeTrackingText(line.inventoryProductId);
  const locationId = normalizeTrackingText(line.locationId);
  const batchNo = normalizeTrackingKey(line.batchNo);

  return stockLines.find((stockLine) => {
    if (normalizeTrackingText(stockLine.inventoryProductId) !== productId) return false;
    if (locationId && normalizeTrackingText(stockLine.locationId) !== locationId) return false;
    if (batchNo && normalizeTrackingKey(stockLine.batchNo) !== batchNo) return false;
    return true;
  }) || null;
}

async function buildPurchaseTrackingByLine(transactions: any[]) {
  const stockTransactionIds = new Set<string>();
  const stockTransactionIdsByBaseDocNo = new Map<string, string[]>();

  function rememberStockTransactionForBase(docNo: string | null | undefined, stockTransactionId: string | null | undefined) {
    if (!docNo || !stockTransactionId) return;
    const baseDocNo = getRevisionBaseDocNo(docNo);
    if (!baseDocNo) return;
    const existing = stockTransactionIdsByBaseDocNo.get(baseDocNo) || [];
    if (!existing.includes(stockTransactionId)) existing.push(stockTransactionId);
    stockTransactionIdsByBaseDocNo.set(baseDocNo, existing);
    stockTransactionIds.add(stockTransactionId);
  }

  for (const transaction of transactions) {
    rememberStockTransactionForBase(transaction.docNo, transaction.stockTransactionId);
    rememberStockTransactionForBase(transaction.revisedFrom?.docNo, transaction.revisedFrom?.stockTransactionId);
    for (const line of transaction.lines || []) {
      for (const link of line.targetLineLinks || []) {
        const sourceStockTransactionId = link.sourceLine?.transaction?.stockTransactionId;
        if (sourceStockTransactionId) stockTransactionIds.add(sourceStockTransactionId);
      }
    }
  }

  if (stockTransactionIds.size === 0) return new Map<string, PurchaseTrackingMeta>();

  const stockTransactions = await db.stockTransaction.findMany({
    where: { id: { in: Array.from(stockTransactionIds) } },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
        include: { serialEntries: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  const stockLinesByTransactionId = new Map<string, typeof stockTransactions[number]["lines"]>();
  for (const stockTransaction of stockTransactions) {
    stockLinesByTransactionId.set(stockTransaction.id, stockTransaction.lines);
  }

  const trackingByLine = new Map<string, PurchaseTrackingMeta>();
  for (const transaction of transactions) {
    for (const line of transaction.lines || []) {
      const baseDocNo = getRevisionBaseDocNo(transaction.docNo);
      const candidateStockTransactionIds = Array.from(new Set([
        transaction.stockTransactionId,
        transaction.revisedFrom?.stockTransactionId,
        ...(stockTransactionIdsByBaseDocNo.get(baseDocNo) || []),
        ...((line.targetLineLinks || [])
          .map((link: any) => link.sourceLine?.transaction?.stockTransactionId)
          .filter(Boolean) as string[]),
      ].filter(Boolean) as string[]));

      for (const stockTransactionId of candidateStockTransactionIds) {
        if (!stockTransactionId) continue;
        const stockLines = stockLinesByTransactionId.get(stockTransactionId) || [];
        const stockLine = findMatchingStockTrackingLine(stockLines, line);
        if (!stockLine) continue;
        const serialNos = uniqueTrackingSerialNos((stockLine.serialEntries || []).map((entry) => entry.serialNo));
        trackingByLine.set(`${transaction.id}__${line.id}`, {
          batchNo: stockLine.batchNo || line.batchNo || null,
          expiryDate: formatTrackingDateInput(stockLine.expiryDate),
          serialNos,
        });
        break;
      }
    }
  }

  return trackingByLine;
}

async function loadSharedData(docType: PurchaseDocType) {
  const [suppliers, products, locations, agents, projects, departments, stockConfig, taxConfig, taxCodes, transactions, sourceDocuments] = await Promise.all([
    db.supplier.findMany({
      where: { isActive: true },
      orderBy: [{ supplierAccountNo: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        supplierAccountNo: true,
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
      where: { isActive: true, OR: [{ trackInventory: true }, { itemType: "SERVICE_ITEM" }] },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        description: true,
        baseUom: true,
        unitCost: true,
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
    db.taxConfiguration.findUnique({ where: { id: "default" }, include: { defaultAdminTaxCode: true } }),
    db.taxCode.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, description: true, rate: true, calculationMethod: true },
    }),
    db.purchaseTransaction.findMany({
      where: { docType },
      orderBy: [{ docDate: "desc" }, { docNo: "desc" }],
      include: {
        revisedFrom: { select: { id: true, docNo: true, stockTransactionId: true } },
        revisions: { select: { id: true, docNo: true, status: true } },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            sourceLineLinks: {
              include: { targetTransaction: { select: { id: true, status: true, revisions: { select: { id: true, status: true } } } } },
            },
            targetLineLinks: {
              include: {
                sourceLine: {
                  select: {
                    id: true,
                    inventoryProductId: true,
                    locationId: true,
                    batchNo: true,
                    transaction: { select: { id: true, stockTransactionId: true } },
                  },
                },
              },
            },
          },
        },
        sourceLinks: { include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, revisions: { select: { id: true, status: true } } } } } },
        targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
      },
    }),
    loadPurchaseSources(docType),
  ]);

  const trackingByLine = await buildPurchaseTrackingByLine(transactions as any[]);

  return {
    suppliers,
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      description: product.description,
      baseUom: product.baseUom,
      unitCost: toNumber(product.unitCost),
      itemType: product.itemType,
      batchTracking: product.batchTracking,
      serialNumberTracking: product.serialNumberTracking,
      isAssemblyItem: product.isAssemblyItem,
      uomConversions: product.uomConversions.map((item) => ({
        id: item.id,
        uomCode: item.uomCode,
        conversionRate: toNumber(item.conversionRate),
      })),
    })),
    locations,
    agents,
    projects,
    departments,
    defaultLocationId: stockConfig?.defaultLocationId || locations[0]?.id || "",
    projectFeatureEnabled: Boolean(stockConfig?.enableProject),
    departmentFeatureEnabled: Boolean(stockConfig?.enableDepartment),
    stockNumberFormat: {
      qtyDecimalPlaces: Number(stockConfig?.qtyDecimalPlaces ?? 2),
      unitCostDecimalPlaces: Number(stockConfig?.unitCostDecimalPlaces ?? 2),
      priceDecimalPlaces: Number(stockConfig?.priceDecimalPlaces ?? 2),
    },
    taxConfig: {
      taxModuleEnabled: Boolean(taxConfig?.taxModuleEnabled),
      taxCalculationMode: (taxConfig?.taxCalculationMode || "TRANSACTION") as any,
      defaultAdminTaxCodeId: taxConfig?.defaultAdminTaxCodeId || null,
      taxCodes: taxCodes.map((tax) => ({ ...tax, rate: toNumber(tax.rate) })),
    },
    transactions: transactions
      .filter((transaction) => transaction.revisions.length === 0)
      .map((transaction) => ({
      id: transaction.id,
      docNo: transaction.docNo,
      docDate: transaction.docDate.toISOString(),
      docDesc: transaction.docDesc,
      supplierId: transaction.supplierId,
      supplierName: transaction.supplierName,
      supplierAccountNo: transaction.supplierAccountNo,
      billingAddressLine1: transaction.billingAddressLine1,
      billingAddressLine2: transaction.billingAddressLine2,
      billingAddressLine3: transaction.billingAddressLine3,
      billingAddressLine4: transaction.billingAddressLine4,
      billingCity: transaction.billingCity,
      billingPostCode: transaction.billingPostCode,
      billingCountryCode: transaction.billingCountryCode,
      deliveryAddressLine1: transaction.deliveryAddressLine1,
      deliveryAddressLine2: transaction.deliveryAddressLine2,
      deliveryAddressLine3: transaction.deliveryAddressLine3,
      deliveryAddressLine4: transaction.deliveryAddressLine4,
      deliveryCity: transaction.deliveryCity,
      deliveryPostCode: transaction.deliveryPostCode,
      deliveryCountryCode: transaction.deliveryCountryCode,
      attention: transaction.attention,
      contactNo: transaction.contactNo,
      email: transaction.email,
      currency: transaction.currency,
      reference: transaction.reference,
      remarks: transaction.remarks,
      agentId: transaction.agentId,
      projectId: transaction.projectId,
      departmentId: transaction.departmentId,
      taxCodeId: transaction.taxCodeId,
      termsAndConditions: transaction.termsAndConditions,
      bankAccount: transaction.bankAccount,
      footerRemarks: transaction.footerRemarks,
      status: transaction.status,
      grandTotal: toNumber(transaction.grandTotal),
      revisedFrom: transaction.revisedFrom ? { id: transaction.revisedFrom.id, docNo: transaction.revisedFrom.docNo } : null,
      revisions: transaction.revisions.map((revision) => ({ id: revision.id, docNo: revision.docNo, status: revision.status })),
      sourceLinks: transaction.sourceLinks.map((link) => ({ targetTransaction: link.targetTransaction })),
      targetLinks: transaction.targetLinks.map((link) => ({ sourceTransaction: link.sourceTransaction })),
      lines: transaction.lines.map((line) => {
        const receivedQty = sumLinkedQty(line, "RECEIVED_TO");
        const invoicedQty = sumLinkedQty(line, "INVOICED_TO");
        const orderedAmount = toNumber(line.lineTotal);
        const receivedAmount = sumLinkedAmount(line, "RECEIVED_TO");
        const invoicedAmount = sumLinkedAmount(line, "INVOICED_TO");
        const trackingMeta = trackingByLine.get(`${transaction.id}__${line.id}`);
        return {
          id: line.id,
          inventoryProductId: line.inventoryProductId,
          productCode: line.productCode,
          productDescription: line.productDescription,
          itemType: line.itemType,
          uom: line.uom,
          qty: toNumber(line.qty),
          receivedQty,
          invoicedQty,
          remainingReceiveQty: Math.max(0, toNumber(line.qty) - receivedQty),
          remainingInvoiceQty: Math.max(0, toNumber(line.qty) - invoicedQty),
          orderedAmount,
          receivedAmount,
          invoicedAmount,
          remainingReceiveAmount: Math.max(0, orderedAmount - receivedAmount),
          remainingInvoiceAmount: Math.max(0, orderedAmount - invoicedAmount),
          unitCost: toNumber(line.unitCost),
          discountRate: toNumber(line.discountRate),
          discountType: line.discountType,
          locationId: line.locationId,
          batchNo: trackingMeta?.batchNo || line.batchNo,
          expiryDate: trackingMeta?.expiryDate || null,
          serialNos: trackingMeta?.serialNos || [],
          taxCodeId: line.taxCodeId,
          remarks: line.remarks,
        };
      }),
    })),
    sourceDocuments: (sourceDocuments as any[]).map((transaction) => ({
      ...transaction,
      docDate: transaction.docDate instanceof Date ? transaction.docDate.toISOString() : transaction.docDate,
      grandTotal: toNumber(transaction.grandTotal),
      lines: (transaction.lines || []).map((line: any) => ({
        ...line,
        qty: toNumber(line.qty),
        unitCost: toNumber(line.unitCost),
        remainingQty: toNumber(line.remainingQty),
      })),
    })),
  };
}

export default async function AdminPurchaseInvoicePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const data = await loadSharedData("PR" as PurchaseDocType);

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <AdminPurchaseReturnClient
          initialTransactions={data.transactions as any}
          sourceDocuments={data.sourceDocuments as any}
          initialSuppliers={data.suppliers as any}
          initialProducts={data.products as any}
          initialAgents={data.agents}
          initialProjects={data.projects}
          initialDepartments={data.departments}
          initialLocations={data.locations}
          defaultLocationId={data.defaultLocationId}
          projectFeatureEnabled={data.projectFeatureEnabled}
          departmentFeatureEnabled={data.departmentFeatureEnabled}
          stockNumberFormat={data.stockNumberFormat}
          taxConfig={data.taxConfig}
        />
      </div>
    </section>
  );
}
