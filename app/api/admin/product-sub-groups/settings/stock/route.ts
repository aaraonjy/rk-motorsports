import { NextResponse } from "next/server";
import { StockCostingMethod } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  DEFAULT_STOCK_NUMBER_FORMAT_CONFIG,
  normalizeMoneyDecimalPlaces,
  normalizeQtyDecimalPlaces,
} from "@/lib/stock-format";

function normalizeCostingMethod(value: unknown): StockCostingMethod {
  return value === StockCostingMethod.AVERAGE ? StockCostingMethod.AVERAGE : StockCostingMethod.AVERAGE;
}

export async function GET() {
  try {
    await requireAdmin();

    const config = await db.stockConfiguration.findUnique({
      where: { id: "default" },
      select: {
        stockModuleEnabled: true,
        multiLocationEnabled: true,
        allowNegativeStock: true,
        costingMethod: true,
        defaultLocationId: true,
        qtyDecimalPlaces: true,
        unitCostDecimalPlaces: true,
        priceDecimalPlaces: true,
        allowDocNoOverrideOB: true,
        allowDocNoOverrideSR: true,
        allowDocNoOverrideSI: true,
        allowDocNoOverrideSA: true,
        allowDocNoOverrideST: true,
        allowDocNoOverrideAS: true,
      },
    });

    return NextResponse.json({
      ok: true,
      config: {
        stockModuleEnabled: config?.stockModuleEnabled ?? false,
        multiLocationEnabled: config?.multiLocationEnabled ?? false,
        allowNegativeStock: config?.allowNegativeStock ?? false,
        costingMethod: config?.costingMethod ?? StockCostingMethod.AVERAGE,
        defaultLocationId: config?.defaultLocationId ?? "",
        qtyDecimalPlaces: normalizeQtyDecimalPlaces(config?.qtyDecimalPlaces),
        unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(config?.unitCostDecimalPlaces),
        priceDecimalPlaces: normalizeMoneyDecimalPlaces(config?.priceDecimalPlaces),
        allowDocNoOverrideOB: config?.allowDocNoOverrideOB ?? false,
        allowDocNoOverrideSR: config?.allowDocNoOverrideSR ?? false,
        allowDocNoOverrideSI: config?.allowDocNoOverrideSI ?? false,
        allowDocNoOverrideSA: config?.allowDocNoOverrideSA ?? false,
        allowDocNoOverrideST: config?.allowDocNoOverrideST ?? false,
        allowDocNoOverrideAS: config?.allowDocNoOverrideAS ?? false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock settings." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const stockModuleEnabled = Boolean(body.stockModuleEnabled);
    const multiLocationEnabled = stockModuleEnabled ? Boolean(body.multiLocationEnabled) : false;
    const allowNegativeStock = stockModuleEnabled ? Boolean(body.allowNegativeStock) : false;
    const costingMethod = normalizeCostingMethod(body.costingMethod);
    const defaultLocationId = typeof body.defaultLocationId === "string" && body.defaultLocationId.trim() ? body.defaultLocationId.trim() : null;
    const qtyDecimalPlaces = normalizeQtyDecimalPlaces(body.qtyDecimalPlaces);
    const unitCostDecimalPlaces = normalizeMoneyDecimalPlaces(body.unitCostDecimalPlaces);
    const priceDecimalPlaces = normalizeMoneyDecimalPlaces(body.priceDecimalPlaces);
    const allowDocNoOverrideOB = stockModuleEnabled ? Boolean(body.allowDocNoOverrideOB) : false;
    const allowDocNoOverrideSR = stockModuleEnabled ? Boolean(body.allowDocNoOverrideSR) : false;
    const allowDocNoOverrideSI = stockModuleEnabled ? Boolean(body.allowDocNoOverrideSI) : false;
    const allowDocNoOverrideSA = stockModuleEnabled ? Boolean(body.allowDocNoOverrideSA) : false;
    const allowDocNoOverrideST = stockModuleEnabled ? Boolean(body.allowDocNoOverrideST) : false;
    const allowDocNoOverrideAS = stockModuleEnabled ? Boolean(body.allowDocNoOverrideAS) : false;

    if (stockModuleEnabled && !defaultLocationId) {
      return NextResponse.json({ ok: false, error: "Default stock location is required when Stock Control is enabled." }, { status: 400 });
    }

    if (stockModuleEnabled && defaultLocationId) {
      const location = await db.stockLocation.findUnique({ where: { id: defaultLocationId }, select: { id: true, isActive: true } });
      if (!location || !location.isActive) {
        return NextResponse.json({ ok: false, error: "Selected default stock location is invalid." }, { status: 400 });
      }
    }

    const existing = await db.stockConfiguration.findUnique({ where: { id: "default" } });

    const saved = await db.stockConfiguration.upsert({
      where: { id: "default" },
      update: {
        stockModuleEnabled,
        multiLocationEnabled,
        allowNegativeStock,
        costingMethod,
        defaultLocationId: stockModuleEnabled ? defaultLocationId : null,
        qtyDecimalPlaces,
        unitCostDecimalPlaces,
        priceDecimalPlaces,
        allowDocNoOverrideOB,
        allowDocNoOverrideSR,
        allowDocNoOverrideSI,
        allowDocNoOverrideSA,
        allowDocNoOverrideST,
        allowDocNoOverrideAS,
      },
      create: {
        id: "default",
        stockModuleEnabled,
        multiLocationEnabled,
        allowNegativeStock,
        costingMethod,
        defaultLocationId: stockModuleEnabled ? defaultLocationId : null,
        qtyDecimalPlaces: DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.qtyDecimalPlaces,
        unitCostDecimalPlaces: DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.unitCostDecimalPlaces,
        priceDecimalPlaces: DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.priceDecimalPlaces,
        allowDocNoOverrideOB,
        allowDocNoOverrideSR,
        allowDocNoOverrideSI,
        allowDocNoOverrideSA,
        allowDocNoOverrideST,
        allowDocNoOverrideAS,
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
            defaultLocationId: existing.defaultLocationId,
            qtyDecimalPlaces: normalizeQtyDecimalPlaces(existing.qtyDecimalPlaces),
            unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(existing.unitCostDecimalPlaces),
            priceDecimalPlaces: normalizeMoneyDecimalPlaces(existing.priceDecimalPlaces),
            allowDocNoOverrideOB: existing.allowDocNoOverrideOB,
            allowDocNoOverrideSR: existing.allowDocNoOverrideSR,
            allowDocNoOverrideSI: existing.allowDocNoOverrideSI,
            allowDocNoOverrideSA: existing.allowDocNoOverrideSA,
            allowDocNoOverrideST: existing.allowDocNoOverrideST,
            allowDocNoOverrideAS: existing.allowDocNoOverrideAS,
          }
        : null,
      newValues: {
        stockModuleEnabled: saved.stockModuleEnabled,
        multiLocationEnabled: saved.multiLocationEnabled,
        allowNegativeStock: saved.allowNegativeStock,
        costingMethod: saved.costingMethod,
        defaultLocationId: saved.defaultLocationId,
        qtyDecimalPlaces: normalizeQtyDecimalPlaces(saved.qtyDecimalPlaces),
        unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(saved.unitCostDecimalPlaces),
        priceDecimalPlaces: normalizeMoneyDecimalPlaces(saved.priceDecimalPlaces),
        allowDocNoOverrideOB: saved.allowDocNoOverrideOB,
        allowDocNoOverrideSR: saved.allowDocNoOverrideSR,
        allowDocNoOverrideSI: saved.allowDocNoOverrideSI,
        allowDocNoOverrideSA: saved.allowDocNoOverrideSA,
        allowDocNoOverrideST: saved.allowDocNoOverrideST,
        allowDocNoOverrideAS: saved.allowDocNoOverrideAS,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, config: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save stock settings." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
