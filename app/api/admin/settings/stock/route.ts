import { NextResponse } from "next/server";
import { StockCostingMethod } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

function normalizeCostingMethod(value: unknown): StockCostingMethod {
  return value === StockCostingMethod.AVERAGE
    ? StockCostingMethod.AVERAGE
    : StockCostingMethod.AVERAGE;
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const stockModuleEnabled = Boolean(body.stockModuleEnabled);
    const multiLocationEnabled = stockModuleEnabled ? Boolean(body.multiLocationEnabled) : false;
    const allowNegativeStock = stockModuleEnabled ? Boolean(body.allowNegativeStock) : false;
    const costingMethod = normalizeCostingMethod(body.costingMethod);
    const multiUomEnabled = stockModuleEnabled ? Boolean(body.multiUomEnabled) : false;
    const serialTrackingEnabled = stockModuleEnabled ? Boolean(body.serialTrackingEnabled) : false;
    const defaultLocationId =
      typeof body.defaultLocationId === "string" && body.defaultLocationId.trim()
        ? body.defaultLocationId.trim()
        : null;

    if (stockModuleEnabled && !defaultLocationId) {
      return NextResponse.json(
        { ok: false, error: "Default stock location is required when Stock Control is enabled." },
        { status: 400 }
      );
    }

    if (stockModuleEnabled && defaultLocationId) {
      const location = await db.stockLocation.findUnique({
        where: { id: defaultLocationId },
        select: { id: true, code: true, isActive: true },
      });

      if (!location || !location.isActive) {
        return NextResponse.json(
          { ok: false, error: "Selected default stock location is invalid." },
          { status: 400 }
        );
      }
    }

    const existing = await db.stockConfiguration.findUnique({
      where: { id: "default" },
    });

    const saved = await db.stockConfiguration.upsert({
      where: { id: "default" },
      update: {
        stockModuleEnabled,
        multiLocationEnabled,
        allowNegativeStock,
        costingMethod,
        multiUomEnabled,
        serialTrackingEnabled,
        defaultLocationId: stockModuleEnabled ? defaultLocationId : null,
      },
      create: {
        id: "default",
        stockModuleEnabled,
        multiLocationEnabled,
        allowNegativeStock,
        costingMethod,
        multiUomEnabled,
        serialTrackingEnabled,
        defaultLocationId: stockModuleEnabled ? defaultLocationId : null,
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
      oldValues: existing
        ? {
            stockModuleEnabled: existing.stockModuleEnabled,
            multiLocationEnabled: existing.multiLocationEnabled,
            allowNegativeStock: existing.allowNegativeStock,
            costingMethod: existing.costingMethod,
            multiUomEnabled: existing.multiUomEnabled,
            serialTrackingEnabled: existing.serialTrackingEnabled,
            defaultLocationId: existing.defaultLocationId,
          }
        : null,
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
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to save stock settings.",
      },
      {
        status:
          error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500,
      }
    );
  }
}
