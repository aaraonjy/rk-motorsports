import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const serialNo = searchParams.get("serialNo")?.trim() || undefined;
    const productId = searchParams.get("productId")?.trim() || undefined;
    const batchNo = searchParams.get("batchNo")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || undefined;

    const rows = await db.inventorySerial.findMany({
      where: {
        ...(serialNo ? { serialNo: { contains: serialNo, mode: "insensitive" } } : {}),
        ...(productId ? { inventoryProductId: productId } : {}),
        ...(locationId ? { currentLocationId: locationId } : {}),
        ...(status && status !== "ALL" ? { status: status as any } : {}),
        ...(batchNo ? { inventoryBatch: { is: { batchNo: { contains: batchNo, mode: "insensitive" } } } } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
        inventoryBatch: { select: { id: true, batchNo: true } },
        currentLocation: { select: { id: true, code: true, name: true } },
        transactionEntries: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          include: {
            transactionLine: { include: { transaction: { select: { transactionNo: true, transactionType: true, transactionDate: true } } } },
          },
        },
      },
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      items: rows.map((item) => ({
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
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load serial data." }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 });
  }
}
