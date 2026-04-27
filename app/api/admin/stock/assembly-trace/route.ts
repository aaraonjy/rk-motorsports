import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapLocationLabel(location?: { code?: string | null; name?: string | null } | null) {
  if (!location) return null;
  return [location.code, location.name].filter(Boolean).join(" — ") || null;
}

function mapLine(line: any) {
  return {
    id: line.id,
    productId: line.inventoryProductId,
    productCode: line.inventoryProduct?.code ?? "",
    productDescription: line.inventoryProduct?.description ?? "",
    qty: toNumber(line.qty),
    uom: line.inventoryProduct?.baseUom ?? "",
    batchNo: line.batchNo ?? null,
    expiryDate: line.expiryDate ? line.expiryDate.toISOString() : null,
    adjustmentDirection: line.adjustmentDirection ?? null,
    locationLabel:
      mapLocationLabel(line.location) ||
      mapLocationLabel(line.fromLocation) ||
      mapLocationLabel(line.toLocation) ||
      null,
    remarks: line.remarks ?? null,
    serialNos: Array.isArray(line.serialEntries)
      ? line.serialEntries.map((entry: any) => entry.serialNo).filter(Boolean)
      : [],
    serialEntries: Array.isArray(line.serialEntries)
      ? line.serialEntries.map((entry: any) => ({
          id: entry.id,
          serialNo: entry.serialNo,
          batchNo: entry.inventoryBatch?.batchNo ?? line.batchNo ?? null,
          expiryDate: entry.inventoryBatch?.expiryDate ? entry.inventoryBatch.expiryDate.toISOString() : null,
        }))
      : [],
  };
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const inventoryProductId = searchParams.get("inventoryProductId")?.trim();
    const batchNo = searchParams.get("batchNo")?.trim();
    const locationId = searchParams.get("locationId")?.trim() || undefined;

    if (!inventoryProductId) {
      return NextResponse.json({ ok: false, error: "inventoryProductId is required." }, { status: 400 });
    }

    if (!batchNo) {
      return NextResponse.json({ ok: true, traces: [] });
    }

    const transactions = await db.stockTransaction.findMany({
      where: {
        transactionType: "AS",
        status: "POSTED",
        lines: {
          some: {
            inventoryProductId,
            batchNo,
            adjustmentDirection: "IN",
            ...(locationId ? { locationId } : {}),
          },
        },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      include: {
        lines: {
          orderBy: [{ createdAt: "asc" }],
          include: {
            inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
            location: { select: { id: true, code: true, name: true } },
            fromLocation: { select: { id: true, code: true, name: true } },
            toLocation: { select: { id: true, code: true, name: true } },
            serialEntries: {
              orderBy: [{ serialNo: "asc" }],
              include: {
                inventoryBatch: { select: { id: true, batchNo: true, expiryDate: true } },
              },
            },
          },
        },
      },
      take: 10,
    });

    const traces = transactions
      .map((transaction) => {
        const finishedGoodLines = transaction.lines
          .filter(
            (line) =>
              line.inventoryProductId === inventoryProductId &&
              line.batchNo === batchNo &&
              line.adjustmentDirection === "IN" &&
              (!locationId || line.locationId === locationId)
          )
          .map(mapLine);

        const componentLines = transaction.lines
          .filter((line) => line.adjustmentDirection === "OUT")
          .map(mapLine);

        return {
          id: transaction.id,
          transactionNo: transaction.transactionNo,
          docNo: transaction.docNo ?? transaction.transactionNo,
          transactionDate: transaction.transactionDate.toISOString(),
          docDate: transaction.docDate ? transaction.docDate.toISOString() : null,
          reference: transaction.reference ?? null,
          remarks: transaction.remarks ?? null,
          finishedGoods: finishedGoodLines,
          components: componentLines,
        };
      })
      .filter((trace) => trace.finishedGoods.length > 0);

    return NextResponse.json({ ok: true, traces });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load assembly trace." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
