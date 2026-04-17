import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const item = await db.inventorySerial.findUnique({
      where: { id },
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
        inventoryBatch: { select: { id: true, batchNo: true } },
        currentLocation: { select: { id: true, code: true, name: true } },
        transactionEntries: {
          orderBy: [{ createdAt: "desc" }],
          include: {
            transactionLine: {
              include: {
                transaction: { select: { transactionNo: true, transactionType: true, transactionDate: true } },
                location: { select: { id: true, code: true, name: true } },
                fromLocation: { select: { id: true, code: true, name: true } },
                toLocation: { select: { id: true, code: true, name: true } },
              },
            },
            inventoryBatch: { select: { batchNo: true } },
          },
          take: 200,
        },
      },
    });

    if (!item) {
      return NextResponse.json({ ok: false, error: "Serial record not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      detail: {
        serial: {
          id: item.id,
          serialNo: item.serialNo,
          inventoryProductId: item.inventoryProductId,
          productCode: item.inventoryProduct.code,
          productDescription: item.inventoryProduct.description,
          batchNo: item.inventoryBatch?.batchNo ?? null,
          currentLocationId: item.currentLocationId,
          currentLocationLabel: item.currentLocation ? `${item.currentLocation.code} — ${item.currentLocation.name}` : "—",
          status: item.status,
          lastTransaction: item.transactionEntries[0]?.transactionLine.transaction.transactionNo ?? null,
          lastTransactionType: item.transactionEntries[0]?.transactionLine.transaction.transactionType ?? null,
          lastDate: item.transactionEntries[0]?.transactionLine.transaction.transactionDate?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        },
        history: item.transactionEntries.map((entry) => ({
          id: entry.id,
          serialNo: entry.serialNo,
          transactionNo: entry.transactionLine.transaction.transactionNo ?? null,
          transactionType: entry.transactionLine.transaction.transactionType ?? null,
          transactionDate: entry.transactionLine.transaction.transactionDate?.toISOString() ?? null,
          lineRemarks: entry.transactionLine.remarks ?? null,
          fromLocationLabel: entry.transactionLine.fromLocation ? `${entry.transactionLine.fromLocation.code} — ${entry.transactionLine.fromLocation.name}` : entry.transactionLine.location ? `${entry.transactionLine.location.code} — ${entry.transactionLine.location.name}` : "—",
          toLocationLabel: entry.transactionLine.toLocation ? `${entry.transactionLine.toLocation.code} — ${entry.transactionLine.toLocation.name}` : entry.transactionLine.transaction.transactionType === "SI" ? "OUT" : entry.transactionLine.location ? `${entry.transactionLine.location.code} — ${entry.transactionLine.location.name}` : "—",
          batchNo: entry.inventoryBatch?.batchNo ?? item.inventoryBatch?.batchNo ?? null,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load serial detail." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}
