import {
  Prisma,
  PurchaseDocType,
  PurchaseLineLinkType,
  PurchaseTransactionStatus,
  StockMovementDirection,
  StockTransactionStatus,
  StockTransactionType,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  acquireAdvisoryLock,
  acquireStockMutationLocks,
  buildLedgerValues,
  createStoredQtyDecimal,
  generateStockTransactionNumber,
} from "@/lib/stock";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  normalizeTaxCalculationMode,
  type TaxCalculationModeValue,
} from "@/lib/tax";

type PurchaseLinePayload = {
  sourceLineId?: string | null;
  sourceTransactionId?: string | null;
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  itemType?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
  uom?: string | null;
  qty?: number | string | null;
  unitCost?: number | string | null;
  claimAmount?: number | string | null;
  discountRate?: number | string | null;
  discountType?: string | null;
  locationId?: string | null;
  batchNo?: string | null;
  taxCodeId?: string | null;
  remarks?: string | null;
};

type PurchasePayload = {
  docNo?: string | null;
  docDate?: string | null;
  docDesc?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierAccountNo?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingAddressLine3?: string | null;
  billingAddressLine4?: string | null;
  billingCity?: string | null;
  billingPostCode?: string | null;
  billingCountryCode?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryAddressLine3?: string | null;
  deliveryAddressLine4?: string | null;
  deliveryCity?: string | null;
  deliveryPostCode?: string | null;
  deliveryCountryCode?: string | null;
  attention?: string | null;
  contactNo?: string | null;
  email?: string | null;
  currency?: string | null;
  reference?: string | null;
  remarks?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  taxCodeId?: string | null;
  termsAndConditions?: string | null;
  bankAccount?: string | null;
  footerRemarks?: string | null;
  sourceTransactionId?: string | null;
  sourceDocType?: PurchaseDocType | null;
  revisedFromId?: string | null;
  lines?: PurchaseLinePayload[];
};

const DOC_LABEL: Record<PurchaseDocType, string> = {
  PO: "Purchase Order",
  GRN: "Goods Received Note",
  PI: "Purchase Invoice",
};

const DOC_PREFIX: Record<PurchaseDocType, string> = {
  PO: "PO",
  GRN: "GRN",
  PI: "PI",
};

function normalizeDate(value: unknown) {
  const raw =
    typeof value === "string" && value.trim()
      ? value.trim()
      : new Date().toISOString().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(date.getTime()))
    throw new Error("Document Date is invalid.");
  return date;
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function decimal(
  value: number | string | null | undefined,
  places = 2,
  fallback = 0,
) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(places));
}

function qtyDecimal(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0)
    throw new Error("Quantity must be greater than zero.");
  return new Prisma.Decimal(numeric.toFixed(3));
}

function getMalaysiaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return { year, month, day, compact: `${year}${month}${day}` };
}

function assertValidManualDocNo(docType: PurchaseDocType, value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const docNo = raw.toUpperCase().replace(/\s+/g, "");
  if (docNo.length > 30) {
    throw new Error(`${DOC_LABEL[docType]} No cannot exceed 30 characters.`);
  }
  return docNo;
}

async function generatePurchaseDocNo(
  tx: Prisma.TransactionClient,
  docType: PurchaseDocType,
  date: Date,
) {
  const { compact } = getMalaysiaDateParts(date);
  const prefix = `${DOC_PREFIX[docType]}-${compact}`;
  await acquireAdvisoryLock(tx, `purchase-docno:${docType}:${compact}`);
  const existing = await tx.purchaseTransaction.findMany({
    where: { docNo: { startsWith: `${prefix}-` } },
    select: { docNo: true },
  });
  let max = 0;
  for (const row of existing) {
    const match = row.docNo.match(new RegExp(`^${prefix}-(\\d{4})$`));
    if (!match) continue;
    max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

async function generatePurchaseRevisionDocNo(
  tx: Prisma.TransactionClient,
  docType: PurchaseDocType,
  originalDocNo: string,
) {
  const match = originalDocNo.match(/^(.+-\d{4})(?:-(\d+))?$/);
  if (!match)
    throw new Error(`${DOC_LABEL[docType]} No is invalid for revision.`);
  const baseDocNo = match[1];
  await acquireAdvisoryLock(
    tx,
    `purchase-docno-revision:${docType}:${baseDocNo}`,
  );
  const existing = await tx.purchaseTransaction.findMany({
    where: {
      docType,
      OR: [{ docNo: baseDocNo }, { docNo: { startsWith: `${baseDocNo}-` } }],
    },
    select: { docNo: true },
  });
  let maxRevisionNo = 0;
  for (const row of existing) {
    const rowMatch = row.docNo.match(new RegExp(`^${baseDocNo}-(\\d+)$`));
    if (!rowMatch) continue;
    const revisionNo = Number(rowMatch[1]);
    if (Number.isFinite(revisionNo))
      maxRevisionNo = Math.max(maxRevisionNo, revisionNo);
  }
  return `${baseDocNo}-${maxRevisionNo + 1}`;
}

async function loadTaxSettings(tx: Prisma.TransactionClient) {
  const config = await tx.taxConfiguration.findUnique({
    where: { id: "default" },
    select: {
      taxModuleEnabled: true,
      taxCalculationMode: true,
      defaultAdminTaxCodeId: true,
    },
  });
  return {
    taxModuleEnabled: Boolean(config?.taxModuleEnabled),
    taxCalculationMode: normalizeTaxCalculationMode(
      config?.taxCalculationMode,
    ) as TaxCalculationModeValue,
    defaultAdminTaxCodeId: config?.defaultAdminTaxCodeId || null,
  };
}

async function snapshotTaxCode(
  tx: Prisma.TransactionClient,
  taxCodeId?: string | null,
) {
  const id = normalizeText(taxCodeId);
  if (!id) return null;
  return tx.taxCode.findFirst({
    where: { id, isActive: true },
    select: {
      id: true,
      code: true,
      description: true,
      displayLabel: true,
      rate: true,
      calculationMethod: true,
    },
  });
}

async function mapLine(
  tx: Prisma.TransactionClient,
  line: PurchaseLinePayload,
  index: number,
  taxEnabled: boolean,
  defaultTaxCodeId: string | null,
) {
  const inventoryProductId = normalizeText(line.inventoryProductId);
  const product = inventoryProductId
    ? await tx.inventoryProduct.findUnique({
        where: { id: inventoryProductId },
        select: {
          id: true,
          code: true,
          description: true,
          baseUom: true,
          itemType: true,
          unitCost: true,
        },
      })
    : null;

  const productCode = normalizeText(line.productCode) || product?.code;
  const productDescription =
    normalizeText(line.productDescription) || product?.description;
  if (!productCode || !productDescription)
    throw new Error(`Line ${index + 1}: Product is required.`);

  const qty = qtyDecimal(line.qty);
  const unitCost = decimal(line.unitCost, 3);
  const discountRate = decimal(line.discountRate, 2);
  const discountType = normalizeText(line.discountType) || "PERCENT";
  const lineSubtotalNumber = toNumber(qty) * toNumber(unitCost);
  const discountAmountNumber =
    discountType === "AMOUNT"
      ? toNumber(discountRate)
      : lineSubtotalNumber * (toNumber(discountRate) / 100);
  const lineTotalNumber = Math.max(
    0,
    Math.round(
      (lineSubtotalNumber - discountAmountNumber + Number.EPSILON) * 100,
    ) / 100,
  );
  const taxCode = await snapshotTaxCode(
    tx,
    normalizeText(line.taxCodeId) || defaultTaxCodeId,
  );
  const lineTax = calculateLineItemTaxBreakdown({
    lineTotal: lineTotalNumber,
    taxRate: taxCode ? Number(taxCode.rate) : 0,
    calculationMethod: taxCode?.calculationMethod || null,
    taxEnabled: taxEnabled && Boolean(taxCode),
  });
  const location = normalizeText(line.locationId)
    ? await tx.stockLocation.findUnique({
        where: { id: normalizeText(line.locationId)! },
        select: { id: true, code: true, name: true },
      })
    : null;

  return {
    lineNo: index + 1,
    inventoryProductId,
    productCode,
    productDescription,
    itemType: (line.itemType || product?.itemType || "STOCK_ITEM") as any,
    uom: normalizeText(line.uom) || product?.baseUom || "PCS",
    qty,
    unitCost,
    discountRate,
    discountType,
    discountAmount: decimal(discountAmountNumber, 2),
    locationId: location?.id || normalizeText(line.locationId),
    locationCode: location?.code || null,
    locationName: location?.name || null,
    batchNo: normalizeText(line.batchNo)?.toUpperCase() || null,
    taxCodeId: taxCode?.id || null,
    taxCode: taxCode?.code || null,
    taxDescription: taxCode?.description || null,
    taxDisplayLabel: taxCode?.displayLabel || null,
    taxRate: decimal(taxCode ? Number(taxCode.rate) : 0, 2),
    taxCalculationMethod: taxCode?.calculationMethod || null,
    taxAmount: decimal(lineTax.taxAmount, 2),
    lineSubtotal: decimal(lineSubtotalNumber, 2),
    lineTotal: decimal(lineTax.lineGrandTotalAfterTax, 2),
    remarks: normalizeText(line.remarks),
    sourceLineId: normalizeText(line.sourceLineId),
    sourceTransactionId: normalizeText(line.sourceTransactionId),
    claimAmount: decimal(line.claimAmount ?? lineTax.lineGrandTotalAfterTax, 2),
  };
}

async function mapLines(
  tx: Prisma.TransactionClient,
  lines: PurchaseLinePayload[] | undefined,
  taxEnabled: boolean,
  defaultTaxCodeId: string | null,
) {
  const rawLines = Array.isArray(lines) ? lines : [];
  if (rawLines.length === 0)
    throw new Error("At least one item line is required.");
  return Promise.all(
    rawLines.map((line, index) =>
      mapLine(tx, line, index, taxEnabled, defaultTaxCodeId),
    ),
  );
}

function calculateTotals(
  lines: Awaited<ReturnType<typeof mapLines>>,
  taxMode: TaxCalculationModeValue,
  taxEnabled: boolean,
  taxCode: any,
) {
  const subtotal = lines.reduce(
    (sum, line) => sum + toNumber(line.lineSubtotal),
    0,
  );
  const discountTotal = lines.reduce(
    (sum, line) => sum + toNumber(line.discountAmount),
    0,
  );
  if (taxMode === "LINE_ITEM") {
    const taxTotal = lines.reduce(
      (sum, line) => sum + toNumber(line.taxAmount),
      0,
    );
    const grandTotal = lines.reduce(
      (sum, line) => sum + toNumber(line.lineTotal),
      0,
    );
    return {
      subtotal,
      discountTotal,
      taxableSubtotal: subtotal - discountTotal,
      taxTotal,
      grandTotal,
    };
  }
  const taxBreakdown = calculateTaxBreakdown({
    subtotal,
    discount: discountTotal,
    taxRate: taxCode ? Number(taxCode.rate) : 0,
    calculationMethod: taxCode?.calculationMethod || null,
    taxEnabled: taxEnabled && Boolean(taxCode),
  });
  return {
    subtotal: taxBreakdown.subtotal,
    discountTotal: taxBreakdown.discount,
    taxableSubtotal: taxBreakdown.taxableSubtotal,
    taxTotal: taxBreakdown.taxAmount,
    grandTotal: taxBreakdown.grandTotalAfterTax,
  };
}

async function assertActiveSupplier(
  tx: Prisma.TransactionClient,
  supplierId: string,
) {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier || !supplier.isActive)
    throw new Error("Selected supplier is inactive or unavailable.");
  return supplier;
}

async function createStockReceive(
  tx: Prisma.TransactionClient,
  transaction: any,
  lines: any[],
) {
  const stockLines = lines.filter(
    (line) =>
      line.inventoryProductId &&
      line.locationId &&
      line.itemType === "STOCK_ITEM",
  );
  if (stockLines.length === 0) return null;
  await acquireStockMutationLocks(
    tx,
    stockLines.map((line) => ({
      inventoryProductId: line.inventoryProductId!,
      locationId: line.locationId!,
      batchNo: line.batchNo,
    })),
  );
  const stockTransactionNo = await generateStockTransactionNumber(
    tx,
    StockTransactionType.SR,
    transaction.docDate,
  );
  const stockTransaction = await tx.stockTransaction.create({
    data: {
      transactionNo: stockTransactionNo,
      transactionType: StockTransactionType.SR,
      transactionDate: transaction.docDate,
      docNo: transaction.docNo,
      reference: `${transaction.docType} ${transaction.docNo}`,
      remarks: "Auto-created from purchase module.",
      status: StockTransactionStatus.POSTED,
      createdByAdminId: transaction.createdByAdminId,
      lines: {
        create: stockLines.map((line) => ({
          inventoryProductId: line.inventoryProductId!,
          qty: createStoredQtyDecimal(line.qty),
          unitCost: decimal(line.unitCost, 3),
          batchNo: line.batchNo,
          locationId: line.locationId,
          remarks: `${transaction.docType} ${transaction.docNo}`,
        })),
      },
    },
    include: { lines: true },
  });
  for (const stockLine of stockTransaction.lines) {
    const values = buildLedgerValues(
      createStoredQtyDecimal(stockLine.qty),
      "IN",
    );
    await tx.stockLedger.create({
      data: {
        movementDate: transaction.docDate,
        movementType: StockTransactionType.SR,
        movementDirection: StockMovementDirection.IN,
        qty: values.qty,
        qtyIn: values.qtyIn,
        qtyOut: values.qtyOut,
        batchNo: stockLine.batchNo,
        inventoryProductId: stockLine.inventoryProductId,
        locationId: stockLine.locationId!,
        transactionId: stockTransaction.id,
        transactionLineId: stockLine.id,
        referenceNo: transaction.docNo,
        referenceText: `${transaction.docType} ${transaction.docNo}`,
        sourceType: `PURCHASE_${transaction.docType}`,
        sourceId: transaction.id,
        remarks: stockLine.remarks,
      },
    });
    if (stockLine.unitCost) {
      await tx.inventoryProduct.update({
        where: { id: stockLine.inventoryProductId },
        data: { unitCost: stockLine.unitCost },
      });
    }
  }
  await tx.purchaseTransaction.update({
    where: { id: transaction.id },
    data: { stockTransactionId: stockTransaction.id },
  });
  return stockTransaction.id;
}

async function refreshSourceStatus(
  tx: Prisma.TransactionClient,
  sourceTransactionId: string,
) {
  const source = await tx.purchaseTransaction.findUnique({
    where: { id: sourceTransactionId },
    include: {
      lines: {
        include: { sourceLineLinks: { include: { targetTransaction: true } } },
      },
    },
  });
  if (!source || source.status === "CANCELLED") return;
  if (source.lines.length === 0) return;
  const linkType: PurchaseLineLinkType =
    source.docType === "GRN" ? "INVOICED_TO" : "RECEIVED_TO";
  const altLinkType: PurchaseLineLinkType = "INVOICED_TO";
  let any = false;
  let all = true;
  for (const line of source.lines) {
    const fulfilled = line.sourceLineLinks
      .filter((link) => link.targetTransaction.status !== "CANCELLED")
      .filter(
        (link) =>
          link.linkType === linkType ||
          (source.docType === "PO" && link.linkType === altLinkType),
      )
      .reduce((sum, link) => sum + toNumber(link.qty), 0);
    if (fulfilled > 0) any = true;
    if (fulfilled + 0.0001 < toNumber(line.qty)) all = false;
  }
  const status: PurchaseTransactionStatus = all
    ? "COMPLETED"
    : any
      ? "PARTIAL"
      : "OPEN";
  await tx.purchaseTransaction.update({
    where: { id: source.id },
    data: { status },
  });
}

function shouldPostStock(
  docType: PurchaseDocType,
  sourceDocType?: PurchaseDocType | null,
) {
  if (docType === "GRN") return true;
  if (docType === "PI") return sourceDocType !== "GRN";
  return false;
}

export async function createPurchaseTransaction(
  docType: PurchaseDocType,
  body: PurchasePayload,
  adminId: string,
) {
  return db.$transaction(async (tx) => {
    const docDate = normalizeDate(body.docDate);
    const revisedFromId = normalizeText(body.revisedFromId);
    const revisedFrom = revisedFromId
      ? await tx.purchaseTransaction.findUnique({
          where: { id: revisedFromId },
          select: { id: true, docType: true, docNo: true, status: true },
        })
      : null;
    if (revisedFromId && (!revisedFrom || revisedFrom.docType !== docType)) {
      throw new Error("Original document for revision was not found.");
    }
    if (revisedFrom?.status === "CANCELLED") {
      throw new Error("Cancelled document cannot be revised.");
    }
    const manualDocNo = revisedFrom
      ? null
      : assertValidManualDocNo(docType, body.docNo);
    const docNo = revisedFrom
      ? await generatePurchaseRevisionDocNo(tx, docType, revisedFrom.docNo)
      : manualDocNo || (await generatePurchaseDocNo(tx, docType, docDate));
    const supplierId = normalizeText(body.supplierId);
    if (!supplierId) throw new Error("Supplier is required.");
    const supplier = await assertActiveSupplier(tx, supplierId);
    const taxSettings = await loadTaxSettings(tx);
    const headerTaxCode = await snapshotTaxCode(
      tx,
      normalizeText(body.taxCodeId),
    );
    const lines = await mapLines(
      tx,
      body.lines,
      taxSettings.taxModuleEnabled,
      taxSettings.taxCalculationMode === "LINE_ITEM"
        ? taxSettings.defaultAdminTaxCodeId
        : null,
    );
    const totals = calculateTotals(
      lines,
      taxSettings.taxCalculationMode,
      taxSettings.taxModuleEnabled,
      headerTaxCode,
    );

    const sourceTransactionIds = Array.from(
      new Set(
        [
          normalizeText(body.sourceTransactionId),
          ...((body.lines || [])
            .map((line) => normalizeText(line.sourceTransactionId))
            .filter(Boolean) as string[]),
        ].filter(Boolean) as string[],
      ),
    );
    const sourceTransactions = sourceTransactionIds.length
      ? await tx.purchaseTransaction.findMany({
          where: { id: { in: sourceTransactionIds } },
          select: { id: true, docType: true, status: true },
        })
      : [];
    if (
      sourceTransactions.length !== sourceTransactionIds.length ||
      sourceTransactions.some((source) => source.status === "CANCELLED")
    ) {
      throw new Error("Source document is not available.");
    }
    const firstSourceTransactionId = sourceTransactionIds[0] || null;
    const firstSource = firstSourceTransactionId
      ? sourceTransactions.find(
          (source) => source.id === firstSourceTransactionId,
        )
      : null;
    let sourceDocType: PurchaseDocType | null = firstSource?.docType || null;

    const transaction = await tx.purchaseTransaction.create({
      data: {
        docType,
        docNo,
        docDate,
        docDesc: normalizeText(body.docDesc),
        status: "OPEN",
        supplierId: supplier.id,
        supplierAccountNo: supplier.supplierAccountNo,
        supplierName: normalizeText(body.supplierName) || supplier.name,
        billingAddressLine1:
          normalizeText(body.billingAddressLine1) ||
          supplier.billingAddressLine1,
        billingAddressLine2:
          normalizeText(body.billingAddressLine2) ||
          supplier.billingAddressLine2,
        billingAddressLine3:
          normalizeText(body.billingAddressLine3) ||
          supplier.billingAddressLine3,
        billingAddressLine4:
          normalizeText(body.billingAddressLine4) ||
          supplier.billingAddressLine4,
        billingCity: normalizeText(body.billingCity) || supplier.billingCity,
        billingPostCode:
          normalizeText(body.billingPostCode) || supplier.billingPostCode,
        billingCountryCode:
          normalizeText(body.billingCountryCode) || supplier.billingCountryCode,
        deliveryAddressLine1:
          normalizeText(body.deliveryAddressLine1) ||
          supplier.deliveryAddressLine1,
        deliveryAddressLine2:
          normalizeText(body.deliveryAddressLine2) ||
          supplier.deliveryAddressLine2,
        deliveryAddressLine3:
          normalizeText(body.deliveryAddressLine3) ||
          supplier.deliveryAddressLine3,
        deliveryAddressLine4:
          normalizeText(body.deliveryAddressLine4) ||
          supplier.deliveryAddressLine4,
        deliveryCity: normalizeText(body.deliveryCity) || supplier.deliveryCity,
        deliveryPostCode:
          normalizeText(body.deliveryPostCode) || supplier.deliveryPostCode,
        deliveryCountryCode:
          normalizeText(body.deliveryCountryCode) ||
          supplier.deliveryCountryCode,
        attention: normalizeText(body.attention) || supplier.attention,
        contactNo: normalizeText(body.contactNo) || supplier.phone,
        email: normalizeText(body.email) || supplier.email,
        currency: normalizeText(body.currency) || supplier.currency || "MYR",
        reference: normalizeText(body.reference),
        remarks: normalizeText(body.remarks),
        agentId: normalizeText(body.agentId) || supplier.agentId,
        projectId: normalizeText(body.projectId),
        departmentId: normalizeText(body.departmentId),
        subtotal: decimal(totals.subtotal, 2),
        discountTotal: decimal(totals.discountTotal, 2),
        taxableSubtotal: decimal(totals.taxableSubtotal, 2),
        taxCodeId: headerTaxCode?.id || null,
        taxCode: headerTaxCode?.code || null,
        taxDescription: headerTaxCode?.description || null,
        taxDisplayLabel: headerTaxCode?.displayLabel || null,
        taxRate: headerTaxCode ? decimal(Number(headerTaxCode.rate), 2) : null,
        taxCalculationMethod: headerTaxCode?.calculationMethod || null,
        taxCalculationModeSnapshot: taxSettings.taxCalculationMode as any,
        isTaxEnabledSnapshot: taxSettings.taxModuleEnabled,
        taxTotal: decimal(totals.taxTotal, 2),
        grandTotal: decimal(totals.grandTotal, 2),
        termsAndConditions: normalizeText(body.termsAndConditions),
        bankAccount: normalizeText(body.bankAccount),
        footerRemarks: normalizeText(body.footerRemarks),
        createdByAdminId: adminId,
        revisedFromId: revisedFrom?.id || null,
        lines: {
          create: lines.map((line) => ({
            lineNo: line.lineNo,
            inventoryProductId: line.inventoryProductId,
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType: line.itemType,
            uom: line.uom,
            qty: line.qty,
            unitCost: line.unitCost,
            discountRate: line.discountRate,
            discountType: line.discountType,
            discountAmount: line.discountAmount,
            locationId: line.locationId,
            locationCode: line.locationCode,
            locationName: line.locationName,
            batchNo: line.batchNo,
            taxCodeId: line.taxCodeId,
            taxCode: line.taxCode,
            taxDescription: line.taxDescription,
            taxDisplayLabel: line.taxDisplayLabel,
            taxRate: line.taxRate,
            taxCalculationMethod: line.taxCalculationMethod,
            taxAmount: line.taxAmount,
            lineSubtotal: line.lineSubtotal,
            lineTotal: line.lineTotal,
            remarks: line.remarks,
          })),
        },
      },
      include: { lines: true },
    });

    if (sourceTransactionIds.length > 0) {
      for (const sourceTransactionId of sourceTransactionIds) {
        await tx.purchaseTransactionLink.create({
          data: {
            sourceTransactionId,
            targetTransactionId: transaction.id,
            linkType: "GENERATED_FROM",
          },
        });
      }
      const linkType: PurchaseLineLinkType =
        docType === "GRN" ? "RECEIVED_TO" : "INVOICED_TO";
      for (let index = 0; index < lines.length; index += 1) {
        const sourceLineId = lines[index].sourceLineId;
        const lineSourceTransactionId =
          lines[index].sourceTransactionId || firstSourceTransactionId;
        if (!sourceLineId || !lineSourceTransactionId) continue;
        const targetLine = transaction.lines[index];
        await tx.purchaseTransactionLineLink.create({
          data: {
            sourceLineId,
            targetLineId: targetLine.id,
            sourceTransactionId: lineSourceTransactionId,
            targetTransactionId: transaction.id,
            linkType,
            qty: targetLine.qty,
            claimAmount: lines[index].claimAmount,
          },
        });
      }
      for (const sourceTransactionId of sourceTransactionIds)
        await refreshSourceStatus(tx, sourceTransactionId);
    }

    if (shouldPostStock(docType, sourceDocType)) {
      await createStockReceive(tx, transaction, lines);
    }

    return transaction;
  });
}

export async function updatePurchaseTransaction(
  docType: PurchaseDocType,
  id: string,
  body: PurchasePayload,
  adminId: string,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.purchaseTransaction.findUnique({
      where: { id },
      include: { targetLinks: true, lines: true },
    });
    if (!current || current.docType !== docType)
      throw new Error("Document not found.");
    if (current.status === "CANCELLED")
      throw new Error("Cancelled document cannot be edited.");
    if (current.targetLinks.length > 0 || current.stockTransactionId)
      throw new Error(
        "This document has generated/stock records. Please create a revised document instead.",
      );
    await tx.purchaseTransactionLine.deleteMany({
      where: { transactionId: id },
    });
    const docDate = normalizeDate(body.docDate);
    const supplierId = normalizeText(body.supplierId) || current.supplierId;
    const supplier = await assertActiveSupplier(tx, supplierId);
    const taxSettings = await loadTaxSettings(tx);
    const headerTaxCode = await snapshotTaxCode(
      tx,
      normalizeText(body.taxCodeId),
    );
    const lines = await mapLines(
      tx,
      body.lines,
      taxSettings.taxModuleEnabled,
      taxSettings.taxCalculationMode === "LINE_ITEM"
        ? taxSettings.defaultAdminTaxCodeId
        : null,
    );
    const totals = calculateTotals(
      lines,
      taxSettings.taxCalculationMode,
      taxSettings.taxModuleEnabled,
      headerTaxCode,
    );
    const updated = await tx.purchaseTransaction.update({
      where: { id },
      data: {
        docDate,
        docDesc: normalizeText(body.docDesc),
        supplierId: supplier.id,
        supplierAccountNo: supplier.supplierAccountNo,
        supplierName: normalizeText(body.supplierName) || supplier.name,
        contactNo: normalizeText(body.contactNo) || supplier.phone,
        email: normalizeText(body.email) || supplier.email,
        currency: normalizeText(body.currency) || supplier.currency || "MYR",
        reference: normalizeText(body.reference),
        remarks: normalizeText(body.remarks),
        agentId: normalizeText(body.agentId) || supplier.agentId,
        projectId: normalizeText(body.projectId),
        departmentId: normalizeText(body.departmentId),
        subtotal: decimal(totals.subtotal, 2),
        discountTotal: decimal(totals.discountTotal, 2),
        taxableSubtotal: decimal(totals.taxableSubtotal, 2),
        taxCodeId: headerTaxCode?.id || null,
        taxCode: headerTaxCode?.code || null,
        taxDescription: headerTaxCode?.description || null,
        taxDisplayLabel: headerTaxCode?.displayLabel || null,
        taxRate: headerTaxCode ? decimal(Number(headerTaxCode.rate), 2) : null,
        taxCalculationMethod: headerTaxCode?.calculationMethod || null,
        taxCalculationModeSnapshot: taxSettings.taxCalculationMode as any,
        isTaxEnabledSnapshot: taxSettings.taxModuleEnabled,
        taxTotal: decimal(totals.taxTotal, 2),
        grandTotal: decimal(totals.grandTotal, 2),
        termsAndConditions: normalizeText(body.termsAndConditions),
        bankAccount: normalizeText(body.bankAccount),
        footerRemarks: normalizeText(body.footerRemarks),
        lines: {
          create: lines.map((line) => ({
            lineNo: line.lineNo,
            inventoryProductId: line.inventoryProductId,
            productCode: line.productCode,
            productDescription: line.productDescription,
            itemType: line.itemType,
            uom: line.uom,
            qty: line.qty,
            unitCost: line.unitCost,
            discountRate: line.discountRate,
            discountType: line.discountType,
            discountAmount: line.discountAmount,
            locationId: line.locationId,
            locationCode: line.locationCode,
            locationName: line.locationName,
            batchNo: line.batchNo,
            taxCodeId: line.taxCodeId,
            taxCode: line.taxCode,
            taxDescription: line.taxDescription,
            taxDisplayLabel: line.taxDisplayLabel,
            taxRate: line.taxRate,
            taxCalculationMethod: line.taxCalculationMethod,
            taxAmount: line.taxAmount,
            lineSubtotal: line.lineSubtotal,
            lineTotal: line.lineTotal,
            remarks: line.remarks,
          })),
        },
      },
    });
    return updated;
  });
}

export async function cancelPurchaseTransaction(
  docType: PurchaseDocType,
  id: string,
  adminId: string,
  reason?: string | null,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.purchaseTransaction.findUnique({
      where: { id },
      include: {
        sourceLinks: { include: { targetTransaction: true } },
        targetLinks: true,
      },
    });
    if (!current || current.docType !== docType)
      throw new Error("Document not found.");
    if (current.status === "CANCELLED") {
      return tx.purchaseTransaction.findUnique({ where: { id } });
    }

    const activeDownstream = current.sourceLinks.filter(
      (link) => link.targetTransaction.status !== "CANCELLED",
    );
    if (activeDownstream.length > 0) {
      const generatedDocs = activeDownstream
        .map((link) => link.targetTransaction.docNo)
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Cannot cancel this document because it has active generated document${activeDownstream.length > 1 ? "s" : ""}${generatedDocs ? `: ${generatedDocs}` : ""}. Please cancel the downstream document first.`,
      );
    }

    if (current.stockTransactionId) {
      const stockTransaction = await tx.stockTransaction.findUnique({
        where: { id: current.stockTransactionId },
        include: { lines: true },
      });

      if (stockTransaction) {
        for (const stockLine of stockTransaction.lines) {
          if (!stockLine.locationId) continue;
          const values = buildLedgerValues(
            createStoredQtyDecimal(stockLine.qty),
            "OUT",
          );
          await tx.stockLedger.create({
            data: {
              movementDate: new Date(),
              movementType: StockTransactionType.SR,
              movementDirection: StockMovementDirection.OUT,
              qty: values.qty,
              qtyIn: values.qtyIn,
              qtyOut: values.qtyOut,
              batchNo: stockLine.batchNo,
              inventoryProductId: stockLine.inventoryProductId,
              locationId: stockLine.locationId,
              transactionId: stockTransaction.id,
              transactionLineId: stockLine.id,
              referenceNo: current.docNo,
              referenceText: `Cancel ${current.docType} ${current.docNo}`,
              sourceType: `PURCHASE_${current.docType}_CANCEL`,
              sourceId: current.id,
              remarks: normalizeText(reason) || "Cancelled by admin",
            },
          });
        }
      }

      await tx.stockTransaction.updateMany({
        where: { id: current.stockTransactionId },
        data: {
          status: StockTransactionStatus.CANCELLED,
          cancelledByAdminId: adminId,
          cancelledAt: new Date(),
          cancelReason: normalizeText(reason) || "Cancelled by admin",
        },
      });
    }

    const updated = await tx.purchaseTransaction.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledByAdminId: adminId,
        cancelledAt: new Date(),
        cancelReason: normalizeText(reason) || "Cancelled by admin",
      },
    });
    for (const link of current.targetLinks)
      await refreshSourceStatus(tx, link.sourceTransactionId);
    return updated;
  });
}

export async function loadPurchaseTransaction(id: string) {
  return db.purchaseTransaction.findUnique({
    where: { id },
    include: {
      supplier: true,
      agent: true,
      project: true,
      department: true,
      lines: {
        orderBy: { lineNo: "asc" },
        include: { sourceLineLinks: { include: { targetTransaction: true } } },
      },
      targetLinks: { include: { sourceTransaction: true } },
      sourceLinks: { include: { targetTransaction: true } },
    },
  });
}

export async function loadPurchaseSources(docType: PurchaseDocType) {
  if (docType === "PO") return [];
  const sourceDocTypes: PurchaseDocType[] =
    docType === "GRN" ? ["PO"] : ["PO", "GRN"];
  const sources = await db.purchaseTransaction.findMany({
    where: {
      docType: { in: sourceDocTypes },
      status: { in: ["OPEN", "PARTIAL"] },
      // Only latest active revision should be available for Generate From.
      // Original documents that already have revision children must be hidden
      // so users cannot generate GRN / PI from outdated revised documents.
      revisions: { none: {} },
    },
    include: {
      lines: {
        orderBy: { lineNo: "asc" },
        include: { sourceLineLinks: { include: { targetTransaction: true } } },
      },
      supplier: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return sources
    .map((source) => ({
      ...source,
      lines: source.lines
        .map((line) => {
          const linkType: PurchaseLineLinkType =
            source.docType === "GRN"
              ? "INVOICED_TO"
              : docType === "GRN"
                ? "RECEIVED_TO"
                : "INVOICED_TO";
          const usedQty = line.sourceLineLinks
            .filter((link) => link.targetTransaction.status !== "CANCELLED")
            .filter((link) => link.linkType === linkType)
            .reduce((sum, link) => sum + toNumber(link.qty), 0);
          const remainingQty = Math.max(0, toNumber(line.qty) - usedQty);
          return { ...line, remainingQty };
        })
        .filter((line) => line.remainingQty > 0),
    }))
    .filter((source) => source.lines.length > 0);
}
