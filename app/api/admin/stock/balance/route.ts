import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const inventoryProductId = searchParams.get("inventoryProductId")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;

    if (inventoryProductId && locationId) {
      const aggregate = await db.stockLedger.aggregate({
        where: { inventoryProductId, locationId },
        _sum: { qtyIn: true, qtyOut: true },
      });

      const qtyIn = Number(aggregate._sum.qtyIn ?? 0);
      const qtyOut = Number(aggregate._sum.qtyOut ?? 0);
      const balance = Math.round((qtyIn - qtyOut + Number.EPSILON) * 100) / 100;
      return NextResponse.json({ ok: true, balance });
    }

    const rows = await db.stockLedger.groupBy({
      by: ["inventoryProductId", "locationId"],
      where: {
        ...(inventoryProductId ? { inventoryProductId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      _sum: {
        qtyIn: true,
        qtyOut: true,
      },
    });

    const productIds = Array.from(new Set(rows.map((row) => row.inventoryProductId)));
    const locationIds = Array.from(new Set(rows.map((row) => row.locationId)));

    const [products, locations] = await Promise.all([
      productIds.length
        ? db.inventoryProduct.findMany({
            where: { id: { in: productIds } },
            select: { id: true, code: true, description: true, baseUom: true },
          })
        : Promise.resolve([]),
      locationIds.length
        ? db.stockLocation.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const productMap = new Map(products.map((item) => [item.id, item]));
    const locationMap = new Map(locations.map((item) => [item.id, item]));

    const balances = rows.map((row) => {
      const qtyIn = Number(row._sum.qtyIn ?? 0);
      const qtyOut = Number(row._sum.qtyOut ?? 0);
      return {
        inventoryProductId: row.inventoryProductId,
        locationId: row.locationId,
        productCode: productMap.get(row.inventoryProductId)?.code ?? null,
        productDescription: productMap.get(row.inventoryProductId)?.description ?? null,
        baseUom: productMap.get(row.inventoryProductId)?.baseUom ?? null,
        locationCode: locationMap.get(row.locationId)?.code ?? null,
        locationName: locationMap.get(row.locationId)?.name ?? null,
        qtyIn,
        qtyOut,
        balance: Math.round((qtyIn - qtyOut + Number.EPSILON) * 100) / 100,
      };
    });

    return NextResponse.json({ ok: true, balances });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock balances." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
