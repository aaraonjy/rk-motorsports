import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  normalizeStockNumberFormatConfig,
  parseNonNegativeNumberWithDecimalPlaces,
  toStoredDecimalString,
  STOCK_STORAGE_DECIMAL_PLACES,
} from "@/lib/stock-format";

type Params = { params: Promise<{ id: string }> };

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeRate(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round((parsed + Number.EPSILON) * 10000) / 10000;
}

function normalizeItemType(value: unknown) {
  if (value === "SERVICE_ITEM" || value === "NON_STOCK_ITEM") return value;
  return "STOCK_ITEM";
}

type UomInput = {
  uomCode: string;
  conversionRate: number | null;
};

function mapProduct(product: any) {
  return {
    id: product.id,
    code: product.code,
    description: product.description,
    group: product.group,
    subGroup: product.subGroup,
    brand: product.brand,
    groupId: product.groupId,
    subGroupId: product.subGroupId,
    brandId: product.brandId,
    itemType: product.itemType,
    baseUom: product.baseUom,
    unitCost: Number(product.unitCost ?? 0),
    sellingPrice: Number(product.sellingPrice ?? 0),
    trackInventory: product.trackInventory,
    serialNumberTracking: product.serialNumberTracking,
    batchTracking: (product as any).batchTracking,
    isAssemblyItem: Boolean((product as any).isAssemblyItem),
    isActive: product.isActive,
    defaultLocationId: product.defaultLocationId,
    defaultLocationLabel: null,
    uomConversions: Array.isArray(product.uomConversions)
      ? product.uomConversions.map((item: any) => ({
          id: item.id,
          uomCode: item.uomCode,
          conversionRate: Number(item.conversionRate ?? 0),
        }))
      : [],
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function GET(req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const product = await db.inventoryProduct.findUnique({
      where: { id },
      include: {
        uomConversions: {
          orderBy: [{ uomCode: "asc" }],
        },
      },
    });

    if (!product) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

    return NextResponse.json({ ok: true, product: mapProduct(product) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load product." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const stockConfig = await db.stockConfiguration.findUnique({ where: { id: "default" } });
    const formatConfig = normalizeStockNumberFormatConfig(stockConfig);

    const existing = await db.inventoryProduct.findUnique({
      where: { id },
      include: {
        uomConversions: {
          orderBy: [{ uomCode: "asc" }],
        },
      },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

    const code = normalizeCode(body.code);
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const groupId = typeof body.groupId === "string" && body.groupId.trim() ? body.groupId.trim() : null;
    const subGroupId = typeof body.subGroupId === "string" && body.subGroupId.trim() ? body.subGroupId.trim() : null;
    const brandId = typeof body.brandId === "string" && body.brandId.trim() ? body.brandId.trim() : null;
    const itemType = normalizeItemType(body.itemType);
    const baseUom = normalizeCode(body.baseUom);
    const unitCost = parseNonNegativeNumberWithDecimalPlaces(body.unitCost, formatConfig.unitCostDecimalPlaces, "Unit cost");
    const sellingPrice = parseNonNegativeNumberWithDecimalPlaces(body.sellingPrice, formatConfig.priceDecimalPlaces, "Selling price");
    const trackInventory = itemType === "STOCK_ITEM" ? Boolean(body.trackInventory) : false;
    const serialNumberTracking = Boolean(body.serialNumberTracking);
    const batchTracking = Boolean(body.batchTracking);
    const requestedAssemblyItem = Boolean(body.isAssemblyItem);
    const isAssemblyItem = itemType === "STOCK_ITEM" && trackInventory ? requestedAssemblyItem : false;
    const isActive = Boolean(body.isActive);
    const defaultLocationId = typeof body.defaultLocationId === "string" && body.defaultLocationId.trim() ? body.defaultLocationId.trim() : null;
    const uomConversions: UomInput[] = Array.isArray(body.uomConversions)
      ? body.uomConversions
          .map((item: any): UomInput => ({
            uomCode: normalizeCode(item?.uomCode),
            conversionRate: normalizeRate(item?.conversionRate),
          }))
          .filter((item: UomInput) => item.uomCode && item.conversionRate != null)
      : [];

    if (!code) return NextResponse.json({ ok: false, error: "Product code is required." }, { status: 400 });
    if (!description) return NextResponse.json({ ok: false, error: "Product description is required." }, { status: 400 });
    if (!baseUom) return NextResponse.json({ ok: false, error: "Base UOM is required." }, { status: 400 });

    const duplicateUom = new Set<string>();
    for (const item of uomConversions) {
      if (item.uomCode === baseUom) {
        return NextResponse.json({ ok: false, error: "Multi UOM code cannot be the same as Base UOM." }, { status: 400 });
      }
      if (duplicateUom.has(item.uomCode)) {
        return NextResponse.json({ ok: false, error: `Duplicate Multi UOM code ${item.uomCode}.` }, { status: 400 });
      }
      duplicateUom.add(item.uomCode);
    }

    const duplicate = await db.inventoryProduct.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: `Product code ${code} already exists.` }, { status: 409 });

    const [group, subGroup, brand] = await Promise.all([
      groupId ? db.productGroup.findUnique({ where: { id: groupId }, select: { id: true, code: true, name: true, isActive: true } }) : Promise.resolve(null),
      subGroupId ? db.productSubGroup.findUnique({ where: { id: subGroupId }, select: { id: true, code: true, name: true, groupId: true, isActive: true } }) : Promise.resolve(null),
      brandId ? db.productBrand.findUnique({ where: { id: brandId }, select: { id: true, code: true, name: true, isActive: true } }) : Promise.resolve(null),
    ]);

    if (groupId && (!group || !group.isActive)) return NextResponse.json({ ok: false, error: "Group not found." }, { status: 400 });
    if (subGroupId && (!subGroup || !subGroup.isActive)) return NextResponse.json({ ok: false, error: "Sub-Group not found." }, { status: 400 });
    if (brandId && (!brand || !brand.isActive)) return NextResponse.json({ ok: false, error: "Brand not found." }, { status: 400 });
    if (group && subGroup && subGroup.groupId !== group.id) return NextResponse.json({ ok: false, error: "Selected Sub-Group does not belong to the selected Group." }, { status: 400 });

    if (defaultLocationId) {
      const location = await db.stockLocation.findUnique({ where: { id: defaultLocationId }, select: { id: true, isActive: true } });
      if (!location || !location.isActive) return NextResponse.json({ ok: false, error: "Selected default location is invalid." }, { status: 400 });
    }

    const updated = await db.inventoryProduct.update({
      where: { id },
      data: {
        code,
        description,
        group: group ? `${group.code} — ${group.name}` : null,
        subGroup: subGroup ? `${subGroup.code} — ${subGroup.name}` : null,
        brand: brand ? `${brand.code} — ${brand.name}` : null,
        groupId: group?.id ?? null,
        subGroupId: subGroup?.id ?? null,
        brandId: brand?.id ?? null,
        itemType,
        baseUom,
        unitCost: new Prisma.Decimal(toStoredDecimalString(unitCost, STOCK_STORAGE_DECIMAL_PLACES.money)),
        sellingPrice: new Prisma.Decimal(toStoredDecimalString(sellingPrice, STOCK_STORAGE_DECIMAL_PLACES.money)),
        trackInventory,
        serialNumberTracking,
        batchTracking,
        isAssemblyItem,
        isActive,
        defaultLocationId,
        uomConversions: {
          deleteMany: {},
          create: uomConversions.map((item) => ({
            uomCode: item.uomCode,
            conversionRate: new Prisma.Decimal(item.conversionRate!.toFixed(4)),
          })),
        },
      },
      include: {
        uomConversions: {
          orderBy: [{ uomCode: "asc" }],
        },
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
      oldValues: { code: existing.code, description: existing.description, itemType: existing.itemType, baseUom: existing.baseUom, unitCost: Number(existing.unitCost), sellingPrice: Number(existing.sellingPrice), trackInventory: existing.trackInventory, serialNumberTracking: existing.serialNumberTracking, batchTracking: (existing as any).batchTracking, isAssemblyItem: Boolean((existing as any).isAssemblyItem), isActive: existing.isActive, uomConversions: existing.uomConversions.map((item: any) => ({ uomCode: item.uomCode, conversionRate: Number(item.conversionRate) })) },
      newValues: { code: updated.code, description: updated.description, itemType: updated.itemType, baseUom: updated.baseUom, unitCost: Number(updated.unitCost), sellingPrice: Number(updated.sellingPrice), trackInventory: updated.trackInventory, serialNumberTracking: updated.serialNumberTracking, batchTracking: (updated as any).batchTracking, isAssemblyItem: Boolean((updated as any).isAssemblyItem), isActive: updated.isActive, uomConversions: updated.uomConversions.map((item: any) => ({ uomCode: item.uomCode, conversionRate: Number(item.conversionRate) })) },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, product: mapProduct(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update product." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function DELETE(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const existing = await db.inventoryProduct.findUnique({ where: { id }, include: { customOrderItems: { select: { id: true }, take: 1 } } });
    if (!existing) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
    if (existing.customOrderItems.length > 0) {
      return NextResponse.json({ ok: false, error: "This product is already used in a custom order. Please set it inactive instead of deleting." }, { status: 400 });
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
      oldValues: { code: existing.code, description: existing.description, itemType: existing.itemType },
      status: "SUCCESS",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete product." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}
