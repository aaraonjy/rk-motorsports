import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStockBalance } from "@/lib/stock";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const inventoryProductId = searchParams.get("inventoryProductId")?.trim() || "";
    const locationId = searchParams.get("locationId")?.trim() || "";

    if (!inventoryProductId || !locationId) {
      return NextResponse.json({ ok: false, error: "inventoryProductId and locationId are required." }, { status: 400 });
    }

    const balance = await getStockBalance(db, inventoryProductId, locationId);
    return NextResponse.json({ ok: true, balance });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock balance." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
