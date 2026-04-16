import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    const items = await db.inventoryBatch.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        inventoryProductId: true,
        batchNo: true,
        expiryDate: true,
      },
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      items: items.map((item) => ({
        ...item,
        expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load batches." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
