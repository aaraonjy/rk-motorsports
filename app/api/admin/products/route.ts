import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  normalizeMoneyDecimalPlaces,
  parseNonNegativeNumberWithDecimalPlaces,
  toStoredDecimalString,
  STOCK_STORAGE_DECIMAL_PLACES,
} from "@/lib/stock-format";

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

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "1" || searchParams.get("activeOnly") === "true";
    const trackInventoryOnly = searchParams.get("trackInventory") === "1" || searchParams.get("trackInventory") === "true";

    const products = await db.inventoryProduct.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(trackInventoryOnly ? { OR: [{ trackInventory: true }, { itemType: "SERVICE_ITEM" }] } : {}),
      },
      orderBy: [{ code: "asc" }],
      include: {
        uomConversions: {
          orderBy: [{ uomCode: "asc" }],
        },
      },
    });

    return NextResponse.json({ ok: true, products: products.map((product) => mapProduct(product)) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load products." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const stockConfig = await db.stockConfiguration.findUnique({ where: { id: "default" } });
    const formatConfig = {
      unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(stockConfig?.unitCostDecimalPlaces),
      priceDecimalPlaces: normalizeMoneyDecimalPlaces(stockConfig?.priceDecimalPlaces),
    };

    const code = normalizeCode(body.code);
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const groupId = typeof body.groupId === "string" && body.groupId.trim() ? body.groupId.trim() : null;
    const subGroupId = typeof body.subGroupId === "string" && body.subGroupId.trim() ? body.subGroupId.trim() : null;
    const brandId = typeof body.brandId === "string" && body.brandId.trim() ? body.brandId.trim() : null;
    const itemType = normalizeItemType(body.itemType);
    const baseUom = normalizeCode(body.baseUom);
    const unitCost = parseNonNegativeNumberWithDecimalPlaces(
      body.unitCost,
      formatConfig.unitCostDecimalPlaces,
      "Unit cost"
    );
    const sellingPrice = parseNonNegativeNumberWithDecimalPlaces(
      body.sellingPrice,
      formatConfig.priceDecimalPlaces,
      "Selling price"
    );
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

    const existing = await db.inventoryProduct.findUnique({ where: { code } });
    if (existing) return NextResponse.json({ ok: false, error: `Product code ${code} already exists.` }, { status: 409 });

    const created = await db.inventoryProduct.create({
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
        uomConversions: uomConversions.length
          ? {
              create: uomConversions.map((item) => ({
                uomCode: item.uomCode,
                conversionRate: new Prisma.Decimal(item.conversionRate!.toFixed(4)),
              })),
            }
          : undefined,
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
        batchTracking: (created as any).batchTracking,
        isAssemblyItem: Boolean((created as any).isAssemblyItem),
        isActive: created.isActive,
        uomConversions: created.uomConversions.map((item: any) => ({
          uomCode: item.uomCode,
          conversionRate: Number(item.conversionRate),
        })),
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, product: mapProduct(created) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create product." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
