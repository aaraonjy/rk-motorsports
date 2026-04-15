import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMoney(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizeItemType(value: unknown) {
  if (value === "SERVICE_ITEM" || value === "NON_STOCK_ITEM") return value;
  return "STOCK_ITEM";
}

function mapProduct(product: Awaited<ReturnType<typeof db.inventoryProduct.create>>) {
  return {
    id: product.id,
    code: product.code,
    description: product.description,
    group: product.group,
    subGroup: product.subGroup,
    brand: product.brand,
    itemType: product.itemType,
    baseUom: product.baseUom,
    unitCost: Number(product.unitCost ?? 0),
    sellingPrice: Number(product.sellingPrice ?? 0),
    trackInventory: product.trackInventory,
    serialNumberTracking: product.serialNumberTracking,
    isActive: product.isActive,
    defaultLocationId: product.defaultLocationId,
    defaultLocationLabel: null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const code = normalizeCode(body.code);
    const description = normalizeText(body.description);
    const group = normalizeText(body.group);
    const subGroup = normalizeText(body.subGroup);
    const brand = normalizeText(body.brand);
    const itemType = normalizeItemType(body.itemType);
    const baseUom = normalizeCode(body.baseUom);
    const unitCost = normalizeMoney(body.unitCost);
    const sellingPrice = normalizeMoney(body.sellingPrice);
    const trackInventory = itemType === "STOCK_ITEM" ? Boolean(body.trackInventory) : false;
    const serialNumberTracking = Boolean(body.serialNumberTracking);
    const isActive = Boolean(body.isActive);
    const defaultLocationId = typeof body.defaultLocationId === "string" && body.defaultLocationId.trim() ? body.defaultLocationId.trim() : null;

    if (!code) {
      return NextResponse.json({ ok: false, error: "Product code is required." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: "Product description is required." }, { status: 400 });
    }

    if (!baseUom) {
      return NextResponse.json({ ok: false, error: "Base UOM is required." }, { status: 400 });
    }

    if (unitCost == null || sellingPrice == null) {
      return NextResponse.json({ ok: false, error: "Unit cost and selling price must be valid positive numbers." }, { status: 400 });
    }

    if (defaultLocationId) {
      const location = await db.stockLocation.findUnique({ where: { id: defaultLocationId }, select: { id: true, isActive: true } });
      if (!location || !location.isActive) {
        return NextResponse.json({ ok: false, error: "Selected default location is invalid." }, { status: 400 });
      }
    }

    const existing = await db.inventoryProduct.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ ok: false, error: `Product code ${code} already exists.` }, { status: 409 });
    }

    const created = await db.inventoryProduct.create({
      data: {
        code,
        description,
        group: group || null,
        subGroup: subGroup || null,
        brand: brand || null,
        itemType,
        baseUom,
        unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
        sellingPrice: new Prisma.Decimal(sellingPrice.toFixed(2)),
        trackInventory,
        serialNumberTracking,
        isActive,
        defaultLocationId,
      },
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Product Master",
      action: "CREATE",
      entityType: "InventoryProduct",
      entityId: created.id,
      entityCode: created.code,
      description: `${admin.name} created product ${created.code}.`,
      newValues: {
        code: created.code,
        description: created.description,
        itemType: created.itemType,
        baseUom: created.baseUom,
        unitCost: Number(created.unitCost),
        sellingPrice: Number(created.sellingPrice),
        trackInventory: created.trackInventory,
        serialNumberTracking: created.serialNumberTracking,
        isActive: created.isActive,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, product: mapProduct(created) });
  } catch (error) {
    console.error("POST /api/admin/products failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create product." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
