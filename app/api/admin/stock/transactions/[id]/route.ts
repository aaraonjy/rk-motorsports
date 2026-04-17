import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const transaction = await db.stockTransaction.findUnique({
      where: { id },
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        lines: {
          include: {
            inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
            location: { select: { id: true, code: true, name: true } },
            fromLocation: { select: { id: true, code: true, name: true } },
            toLocation: { select: { id: true, code: true, name: true } },
            serialEntries: {
              orderBy: [{ serialNo: "asc" }],
              include: {
                inventorySerial: { select: { id: true, serialNo: true, status: true } },
                inventoryBatch: { select: { id: true, batchNo: true, expiryDate: true } },
              },
            },
            ledgerEntries: {
              orderBy: [{ createdAt: "asc" }],
              include: {
                location: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json({ ok: false, error: "Stock transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock transaction." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
