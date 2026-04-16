
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
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
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const groupId = typeof body.groupId === "string" && body.groupId.trim() ? body.groupId.trim() : null;
    const subGroupId = typeof body.subGroupId === "string" && body.subGroupId.trim() ? body.subGroupId.trim() : null;
    const brandId = typeof body.brandId === "string" && body.brandId.trim() ? body.brandId.trim() : null;
    const itemType = normalizeItemType(body.itemType);
    const baseUom = normalizeCode(body.baseUom);
    const unitCost = normalizeMoney(body.unitCost);
    const sellingPrice = normalizeMoney(body.sellingPrice);
    const trackInventory = itemType === "STOCK_ITEM" ? Boolean(body.trackInventory) : false;
    const serialNumberTracking = Boolean(body.serialNumberTracking);
    const batchTracking = Boolean(body.batchTracking);
    const isActive = Boolean(body.isActive);
    const defaultLocationId = typeof body.defaultLocationId === "string" && body.defaultLocationId.trim() ? body.defaultLocationId.trim() : null;

    if (!code) return NextResponse.json({ ok: false, error: "Product code is required." }, { status: 400 });
    if (!description) return NextResponse.json({ ok: false, error: "Product description is required." }, { status: 400 });
    if (!baseUom) return NextResponse.json({ ok: false, error: "Base UOM is required." }, { status: 400 });
    if (unitCost == null || sellingPrice == null) {
      return NextResponse.json({ ok: false, error: "Unit cost and selling price must be valid positive numbers." }, { status: 400 });
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
        unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
        sellingPrice: new Prisma.Decimal(sellingPrice.toFixed(2)),
        trackInventory,
        serialNumberTracking,
        batchTracking,
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
      newValues: { code: created.code, description: created.description, itemType: created.itemType, baseUom: created.baseUom, unitCost: Number(created.unitCost), sellingPrice: Number(created.sellingPrice), trackInventory: created.trackInventory, serialNumberTracking: created.serialNumberTracking, batchTracking: (created as any).batchTracking, isActive: created.isActive },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, product: mapProduct(created) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create product." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}
