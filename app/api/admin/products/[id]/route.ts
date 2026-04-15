import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

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

function mapProduct(product: Awaited<ReturnType<typeof db.inventoryProduct.update>>) {
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

export async function PATCH(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.inventoryProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
    }

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

    const duplicate = await db.inventoryProduct.findFirst({
      where: {
        code,
        NOT: { id },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ ok: false, error: `Product code ${code} already exists.` }, { status: 409 });
    }

    if (defaultLocationId) {
      const location = await db.stockLocation.findUnique({ where: { id: defaultLocationId }, select: { id: true, isActive: true } });
      if (!location || !location.isActive) {
        return NextResponse.json({ ok: false, error: "Selected default location is invalid." }, { status: 400 });
      }
    }

    const updated = await db.inventoryProduct.update({
      where: { id },
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
      action: "UPDATE",
      entityType: "InventoryProduct",
      entityId: updated.id,
      entityCode: updated.code,
      description: `${admin.name} updated product ${updated.code}.`,
      oldValues: {
        code: existing.code,
        description: existing.description,
        itemType: existing.itemType,
        baseUom: existing.baseUom,
        unitCost: Number(existing.unitCost),
        sellingPrice: Number(existing.sellingPrice),
        trackInventory: existing.trackInventory,
        serialNumberTracking: existing.serialNumberTracking,
        isActive: existing.isActive,
      },
      newValues: {
        code: updated.code,
        description: updated.description,
        itemType: updated.itemType,
        baseUom: updated.baseUom,
        unitCost: Number(updated.unitCost),
        sellingPrice: Number(updated.sellingPrice),
        trackInventory: updated.trackInventory,
        serialNumberTracking: updated.serialNumberTracking,
        isActive: updated.isActive,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, product: mapProduct(updated) });
  } catch (error) {
    console.error("PATCH /api/admin/products/[id] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update product." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function DELETE(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const existing = await db.inventoryProduct.findUnique({
      where: { id },
      include: {
        customOrderItems: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
    }

    if (existing.customOrderItems.length > 0) {
      return NextResponse.json(
        { ok: false, error: "This product is already used in a custom order. Please set it inactive instead of deleting." },
        { status: 400 }
      );
    }

    await db.inventoryProduct.delete({ where: { id } });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Product Master",
      action: "DELETE",
      entityType: "InventoryProduct",
      entityId: existing.id,
      entityCode: existing.code,
      description: `${admin.name} deleted product ${existing.code}.`,
      oldValues: {
        code: existing.code,
        description: existing.description,
        itemType: existing.itemType,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/products/[id] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to delete product." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
