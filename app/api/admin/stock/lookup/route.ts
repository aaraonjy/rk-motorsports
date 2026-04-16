import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();

    const [locations, products, config] = await Promise.all([
      db.stockLocation.findMany({
        where: { isActive: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
        select: { id: true, code: true, name: true },
      }),
      db.inventoryProduct.findMany({
        where: {
          isActive: true,
          trackInventory: true,
        },
        orderBy: [{ code: "asc" }],
        select: {
          id: true,
          code: true,
          description: true,
          baseUom: true,
          defaultLocationId: true,
        },
      }),
      db.stockConfiguration.findUnique({ where: { id: "default" } }),
    ]);

    return NextResponse.json({
      ok: true,
      locations,
      products,
      config: {
        stockModuleEnabled: Boolean(config?.stockModuleEnabled),
        multiLocationEnabled: Boolean(config?.multiLocationEnabled),
        allowNegativeStock: Boolean(config?.allowNegativeStock),
        defaultLocationId: config?.defaultLocationId ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock lookup." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
