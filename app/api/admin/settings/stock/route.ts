import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

function normalizeCostingMethod(value: unknown) {
  return value === "AVERAGE" ? "AVERAGE" : "AVERAGE";
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const stockModuleEnabled = Boolean(body.stockModuleEnabled);
    const multiLocationEnabled = Boolean(body.multiLocationEnabled);
    const allowNegativeStock = Boolean(body.allowNegativeStock);
    const costingMethod = normalizeCostingMethod(body.costingMethod);
    const multiUomEnabled = Boolean(body.multiUomEnabled);
    const serialTrackingEnabled = Boolean(body.serialTrackingEnabled);
    const defaultLocationId = typeof body.defaultLocationId === "string" && body.defaultLocationId.trim() ? body.defaultLocationId.trim() : null;

    if (!defaultLocationId) {
      return NextResponse.json({ ok: false, error: "Default stock location is required." }, { status: 400 });
    }

    const location = await db.stockLocation.findUnique({ where: { id: defaultLocationId }, select: { id: true, code: true, isActive: true } });
    if (!location || !location.isActive) {
      return NextResponse.json({ ok: false, error: "Selected default stock location is invalid." }, { status: 400 });
    }

    const existing = await db.stockConfiguration.findUnique({ where: { id: "default" } });

    const saved = await db.stockConfiguration.upsert({
      where: { id: "default" },
      update: {
        stockModuleEnabled,
        multiLocationEnabled,
        allowNegativeStock,
        costingMethod,
        multiUomEnabled,
        serialTrackingEnabled,
        defaultLocationId,
      },
      create: {
        id: "default",
        stockModuleEnabled,
        multiLocationEnabled,
        allowNegativeStock,
        costingMethod,
        multiUomEnabled,
        serialTrackingEnabled,
        defaultLocationId,
      },
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Stock Settings",
      action: existing ? "UPDATE" : "CREATE",
      entityType: "StockConfiguration",
      entityId: saved.id,
      entityCode: "default",
      description: `${admin.name} ${existing ? "updated" : "created"} the stock configuration settings.`,
      oldValues: existing ? {
        stockModuleEnabled: existing.stockModuleEnabled,
        multiLocationEnabled: existing.multiLocationEnabled,
        allowNegativeStock: existing.allowNegativeStock,
        costingMethod: existing.costingMethod,
        multiUomEnabled: existing.multiUomEnabled,
        serialTrackingEnabled: existing.serialTrackingEnabled,
        defaultLocationId: existing.defaultLocationId,
      } : null,
      newValues: {
        stockModuleEnabled: saved.stockModuleEnabled,
        multiLocationEnabled: saved.multiLocationEnabled,
        allowNegativeStock: saved.allowNegativeStock,
        costingMethod: saved.costingMethod,
        multiUomEnabled: saved.multiUomEnabled,
        serialTrackingEnabled: saved.serialTrackingEnabled,
        defaultLocationId: saved.defaultLocationId,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/settings/stock failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save stock settings." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
