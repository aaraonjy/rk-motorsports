import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const inventoryProductId = searchParams.get("inventoryProductId")?.trim();
    const locationId = searchParams.get("locationId")?.trim();
    const batchNo = searchParams.get("batchNo")?.trim() || undefined;
    const q = searchParams.get("q")?.trim() || undefined;

    if (!inventoryProductId) {
      return NextResponse.json({ ok: false, error: "inventoryProductId is required." }, { status: 400 });
    }

    if (!locationId) {
      return NextResponse.json({ ok: false, error: "locationId is required." }, { status: 400 });
    }

    const serials = await db.inventorySerial.findMany({
      where: {
        inventoryProductId,
        currentLocationId: locationId,
        status: "IN_STOCK",
        ...(batchNo
          ? {
              inventoryBatch: {
                is: {
                  batchNo,
                },
              },
            }
          : {}),
        ...(q
          ? {
              serialNo: {
                contains: q,
                mode: "insensitive",
              },
            }
          : {}),
      },
      orderBy: [{ serialNo: "asc" }],
      include: {
        inventoryBatch: {
          select: { id: true, batchNo: true, expiryDate: true },
        },
      },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      serials: serials.map((item) => ({
        id: item.id,
        serialNo: item.serialNo,
        batchNo: item.inventoryBatch?.batchNo ?? null,
        expiryDate: item.inventoryBatch?.expiryDate?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load available serials." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
