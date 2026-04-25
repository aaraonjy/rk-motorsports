import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

type QuotationLinePayload = {
  inventoryProductId?: string | null;
  productCode?: string | null;
  productDescription?: string | null;
  uom?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  discountRate?: number | string | null;
  taxRate?: number | string | null;
  remarks?: string | null;
};

function normalizeDate(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Document Date is invalid.");
  return date;
}

function decimal(value: number | string | null | undefined, fallback = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(numeric.toFixed(2));
}

function qtyDecimal(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Quantity must be greater than zero.");
  return new Prisma.Decimal(numeric.toFixed(3));
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertValidManualDocNo(value: unknown) {
  const docNo = normalizeText(value)?.toUpperCase() || null;
  if (!docNo) return null;
  if (!/^QO-\d{8}-\d{4}$/.test(docNo)) {
    throw new Error("Quotation No must use QO-YYYYMMDD-0001 format.");
  }
  return docNo;
}

async function generateQuotationNo(tx: Prisma.TransactionClient, docDate: Date) {
  const yyyy = String(docDate.getFullYear());
  const mm = String(docDate.getMonth() + 1).padStart(2, "0");
  const dd = String(docDate.getDate()).padStart(2, "0");
  const prefix = `QO-${yyyy}${mm}${dd}`;

  const latest = await tx.salesTransaction.findFirst({
    where: { docType: "QO", docNo: { startsWith: `${prefix}-` } },
    orderBy: { docNo: "desc" },
    select: { docNo: true },
  });

  const match = latest?.docNo?.match(/-(\d{4})$/);
  const next = (match ? Number(match[1]) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

function calculateLine(line: QuotationLinePayload, lineNo: number, productMap: Map<string, any>) {
  const inventoryProductId = typeof line.inventoryProductId === "string" && line.inventoryProductId.trim() ? line.inventoryProductId.trim() : null;
  const product = inventoryProductId ? productMap.get(inventoryProductId) : null;

  const productCode = normalizeText(line.productCode) || product?.code || "";
  const productDescription = normalizeText(line.productDescription) || product?.description || "";
  const uom = (normalizeText(line.uom) || product?.baseUom || "UNIT").toUpperCase();

  if (!productCode || !productDescription) throw new Error(`Product line ${lineNo} is missing product information.`);

  const qty = qtyDecimal(line.qty);
  const unitPrice = decimal(line.unitPrice, product ? Number(product.sellingPrice ?? 0) : 0);
  const discountRate = decimal(line.discountRate, 0);
  const taxRate = decimal(line.taxRate, 0);

  const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);
  const discountAmount = lineSubtotal.mul(discountRate).div(100).toDecimalPlaces(2);
  const taxableAmount = lineSubtotal.minus(discountAmount).toDecimalPlaces(2);
  const taxAmount = taxableAmount.mul(taxRate).div(100).toDecimalPlaces(2);
  const lineTotal = taxableAmount.plus(taxAmount).toDecimalPlaces(2);

  return {
    lineNo,
    inventoryProductId,
    productCode,
    productDescription,
    uom,
    qty,
    unitPrice,
    discountRate,
    discountAmount,
    taxRate,
    taxAmount,
    lineSubtotal,
    lineTotal,
    remarks: normalizeText(line.remarks),
  };
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || "ALL";

    const rows = await db.salesTransaction.findMany({
      where: {
        docType: "QO",
        ...(status !== "ALL" ? { status: status as SalesTransactionStatus } : {}),
        ...(q
          ? {
              OR: [
                { docNo: { contains: q, mode: "insensitive" } },
                { customerName: { contains: q, mode: "insensitive" } },
                { customerAccountNo: { contains: q, mode: "insensitive" } },
                { reference: { contains: q, mode: "insensitive" } },
                { docDesc: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ docNo: "desc" }],
      take: 100,
      include: {
        customer: { select: { id: true, name: true, email: true, customerAccountNo: true } },
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    return NextResponse.json({ ok: true, transactions: rows });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load quotations." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const docDate = normalizeDate(body.docDate);
    const requestedDocNo = assertValidManualDocNo(body.docNo);
    const customerId = normalizeText(body.customerId);
    if (!customerId) return NextResponse.json({ ok: false, error: "Customer is required." }, { status: 400 });

    const rawLines = Array.isArray(body.lines) ? (body.lines as QuotationLinePayload[]) : [];
    if (rawLines.length === 0) return NextResponse.json({ ok: false, error: "Please add at least one product line." }, { status: 400 });

    const [customer, config] = await Promise.all([
      db.user.findFirst({
        where: { id: customerId, role: "CUSTOMER" },
        include: { agent: true },
      }),
      db.stockConfiguration.findUnique({ where: { id: "default" } }),
    ]);

    if (!customer) return NextResponse.json({ ok: false, error: "Selected customer is invalid." }, { status: 400 });

    const productIds = Array.from(new Set(rawLines.map((line) => normalizeText(line.inventoryProductId)).filter(Boolean))) as string[];
    const products = productIds.length
      ? await db.inventoryProduct.findMany({
          where: { id: { in: productIds }, isActive: true },
          select: { id: true, code: true, description: true, baseUom: true, sellingPrice: true },
        })
      : [];
    const productMap = new Map(products.map((item) => [item.id, item]));
    const normalizedLines = rawLines.map((line, index) => calculateLine(line, index + 1, productMap));

    const subtotal = normalizedLines.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const discountTotal = normalizedLines.reduce((sum, line) => sum.plus(line.discountAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const taxTotal = normalizedLines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const grandTotal = normalizedLines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);

    const projectFeatureEnabled = Boolean(config?.enableProject);
    const departmentFeatureEnabled = projectFeatureEnabled && Boolean(config?.enableDepartment);
    const projectId = projectFeatureEnabled ? normalizeText(body.projectId) : null;
    const departmentId = departmentFeatureEnabled ? normalizeText(body.departmentId) : null;

    const created = await db.$transaction(async (tx) => {
      const docNo = requestedDocNo || (await generateQuotationNo(tx, docDate));

      const existing = await tx.salesTransaction.findUnique({ where: { docNo }, select: { id: true } });
      if (existing) throw new Error("Quotation No already exists.");

      return tx.salesTransaction.create({
        data: {
          docType: "QO",
          docNo,
          docDate,
          docDesc: normalizeText(body.docDesc),
          status: "PENDING",
          customerId: customer.id,
          customerAccountNo: customer.customerAccountNo,
          customerName: customer.name,
          billingAddressLine1: normalizeText(body.billingAddressLine1) ?? customer.billingAddressLine1,
          billingAddressLine2: normalizeText(body.billingAddressLine2) ?? customer.billingAddressLine2,
          billingAddressLine3: normalizeText(body.billingAddressLine3) ?? customer.billingAddressLine3,
          billingAddressLine4: normalizeText(body.billingAddressLine4) ?? customer.billingAddressLine4,
          billingCity: normalizeText(body.billingCity) ?? customer.billingCity,
          billingPostCode: normalizeText(body.billingPostCode) ?? customer.billingPostCode,
          billingCountryCode: normalizeText(body.billingCountryCode) ?? customer.billingCountryCode,
          deliveryAddressLine1: normalizeText(body.deliveryAddressLine1) ?? customer.deliveryAddressLine1,
          deliveryAddressLine2: normalizeText(body.deliveryAddressLine2) ?? customer.deliveryAddressLine2,
          deliveryAddressLine3: normalizeText(body.deliveryAddressLine3) ?? customer.deliveryAddressLine3,
          deliveryAddressLine4: normalizeText(body.deliveryAddressLine4) ?? customer.deliveryAddressLine4,
          deliveryCity: normalizeText(body.deliveryCity) ?? customer.deliveryCity,
          deliveryPostCode: normalizeText(body.deliveryPostCode) ?? customer.deliveryPostCode,
          deliveryCountryCode: normalizeText(body.deliveryCountryCode) ?? customer.deliveryCountryCode,
          attention: normalizeText(body.attention) ?? customer.attention,
          contactNo: normalizeText(body.contactNo) ?? customer.phone,
          email: normalizeText(body.email) ?? customer.email,
          currency: normalizeText(body.currency) ?? customer.currency ?? "MYR",
          reference: normalizeText(body.reference),
          remarks: normalizeText(body.remarks),
          agentId: normalizeText(body.agentId) ?? customer.agentId,
          projectId,
          departmentId,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          termsAndConditions: normalizeText(body.termsAndConditions),
          bankAccount: normalizeText(body.bankAccount),
          footerRemarks: normalizeText(body.footerRemarks),
          createdByAdminId: admin.id,
          lines: { create: normalizedLines },
        },
      });
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Sales Quotation",
      action: "CREATE",
      entityType: "SalesTransaction",
      entityId: created.id,
      entityCode: created.docNo,
      description: `${admin.name} created quotation ${created.docNo}.`,
      newValues: {
        docType: "QO",
        docNo: created.docNo,
        customerId: customer.id,
        customerName: customer.name,
        lineCount: normalizedLines.length,
        grandTotal: grandTotal.toString(),
      },
      status: "SUCCESS",
    }).catch(() => null);

    return NextResponse.json({ ok: true, transaction: created });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create quotation." },
      { status: 400 }
    );
  }
}
