import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function loadSerialList(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawPage = Number(searchParams.get("page") || "1");
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = 10;
  const q = searchParams.get("q")?.trim() || undefined;
  const productId = searchParams.get("inventoryProductId")?.trim() || searchParams.get("productId")?.trim() || "ALL";
  const batchNo = searchParams.get("batchNo")?.trim() || undefined;
  const locationId = searchParams.get("locationId")?.trim() || "ALL";
  const status = searchParams.get("status")?.trim() || "ALL";

  const where: any = {
    ...(productId !== "ALL" ? { inventoryProductId: productId } : {}),
    ...(locationId !== "ALL" ? { currentLocationId: locationId } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(batchNo ? { inventoryBatch: { is: { batchNo: { equals: batchNo, mode: "insensitive" } } } } : {}),
    ...(q
      ? {
          OR: [
            { serialNo: { contains: q, mode: "insensitive" } },
            { inventoryProduct: { is: { code: { contains: q, mode: "insensitive" } } } },
            { inventoryProduct: { is: { description: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [total, serials] = await Promise.all([
    db.inventorySerial.count({ where }),
    db.inventorySerial.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { serialNo: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        inventoryProduct: { select: { id: true, code: true, description: true } },
        inventoryBatch: { select: { id: true, batchNo: true, expiryDate: true } },
        currentLocation: { select: { id: true, code: true, name: true } },
        transactionEntries: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          include: { transactionLine: { include: { transaction: { select: { transactionNo: true, transactionType: true, transactionDate: true } } } } },
        },
      },
    }),
  ]);

  const rows = serials.map((item) => {
    const lastEntry = item.transactionEntries[0];
    return {
      id: item.id,
      serialNo: item.serialNo,
      inventoryProductId: item.inventoryProductId,
      productCode: item.inventoryProduct.code,
      productDescription: item.inventoryProduct.description,
      batchNo: item.inventoryBatch?.batchNo ?? null,
      expiryDate: item.inventoryBatch?.expiryDate?.toISOString() ?? null,
      currentLocationId: item.currentLocationId,
      currentLocationLabel: item.currentLocation ? `${item.currentLocation.code} — ${item.currentLocation.name}` : "—",
      status: item.status,
      lastTransaction: lastEntry?.transactionLine.transaction.transactionNo ?? null,
      lastTransactionType: lastEntry?.transactionLine.transaction.transactionType ?? null,
      lastDate: formatDate(lastEntry?.transactionLine.transaction.transactionDate),
      createdAt: formatDate(item.createdAt),
      updatedAt: formatDate(item.updatedAt),
    };
  });

  return NextResponse.json(
    { ok: true, rows, items: rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } },
    { headers: NO_STORE_HEADERS }
  );
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode")?.trim();
    if (mode === "list") return loadSerialList(req);

    const inventoryProductId = searchParams.get("inventoryProductId")?.trim() || searchParams.get("productId")?.trim();
    const locationId = searchParams.get("locationId")?.trim();
    const batchNo = searchParams.get("batchNo")?.trim() || undefined;
    const q = searchParams.get("q")?.trim() || undefined;

    if (!inventoryProductId) return NextResponse.json({ ok: false, error: "inventoryProductId is required." }, { status: 400, headers: NO_STORE_HEADERS });
    if (!locationId) return NextResponse.json({ ok: false, error: "locationId is required." }, { status: 400, headers: NO_STORE_HEADERS });

    const serials = await db.inventorySerial.findMany({
      where: {
        inventoryProductId,
        currentLocationId: locationId,
        status: "IN_STOCK",
        ...(batchNo ? { inventoryBatch: { is: { batchNo: { equals: batchNo, mode: "insensitive" } } } } : {}),
        ...(q ? { serialNo: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ serialNo: "asc" }],
      include: { inventoryBatch: { select: { id: true, batchNo: true, expiryDate: true } } },
      take: 200,
    });

    const items = serials.map((item) => ({
      id: item.id,
      serialNo: item.serialNo,
      batchNo: item.inventoryBatch?.batchNo ?? null,
      expiryDate: item.inventoryBatch?.expiryDate?.toISOString() ?? null,
    }));

    return NextResponse.json({ ok: true, serials: items, items }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load available serials." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500, headers: NO_STORE_HEADERS }
    );
  }
}
