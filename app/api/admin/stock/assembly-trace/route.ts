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

function batchKey(productId?: string | null, batchNo?: string | null) {
  const normalizedProductId = String(productId || "").trim();
  const normalizedBatchNo = String(batchNo || "").trim().toUpperCase();
  if (!normalizedProductId || !normalizedBatchNo) return "";
  return `${normalizedProductId}__${normalizedBatchNo}`;
}

function toIsoDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapLine(line: any, batchExpiryMap: Map<string, string | null>) {
  const currentBatchKey = batchKey(line.inventoryProductId, line.batchNo);
  const resolvedExpiryDate = toIsoDate(line.expiryDate) || (currentBatchKey ? batchExpiryMap.get(currentBatchKey) || null : null);

  return {
    id: line.id,
    productId: line.inventoryProductId,
    productCode: line.inventoryProduct?.code ?? "",
    productDescription: line.inventoryProduct?.description ?? "",
    qty: toNumber(line.qty),
    uom: line.inventoryProduct?.baseUom ?? "",
    batchNo: line.batchNo ?? null,
    expiryDate: resolvedExpiryDate,
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
      ? line.serialEntries.map((entry: any) => {
          const entryBatchNo = entry.inventoryBatch?.batchNo ?? line.batchNo ?? null;
          const entryBatchKey = batchKey(entry.inventoryProductId ?? line.inventoryProductId, entryBatchNo);
          const entryExpiryDate =
            toIsoDate(entry.inventoryBatch?.expiryDate) ||
            (entryBatchKey ? batchExpiryMap.get(entryBatchKey) || null : null);

          return {
            id: entry.id,
            serialNo: entry.serialNo,
            batchNo: entryBatchNo,
            expiryDate: entryExpiryDate,
          };
        })
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

    const batchConditions = new Map<string, { inventoryProductId: string; batchNo: string }>();

    for (const transaction of transactions) {
      for (const line of transaction.lines) {
        const lineBatchKey = batchKey(line.inventoryProductId, line.batchNo);
        if (lineBatchKey && !batchConditions.has(lineBatchKey)) {
          batchConditions.set(lineBatchKey, { inventoryProductId: line.inventoryProductId, batchNo: String(line.batchNo) });
        }

        for (const entry of line.serialEntries || []) {
          const entryBatchNo = entry.inventoryBatch?.batchNo ?? line.batchNo ?? null;
          const entryBatchKey = batchKey(entry.inventoryProductId ?? line.inventoryProductId, entryBatchNo);
          if (entryBatchKey && !batchConditions.has(entryBatchKey)) {
            batchConditions.set(entryBatchKey, { inventoryProductId: entry.inventoryProductId ?? line.inventoryProductId, batchNo: String(entryBatchNo) });
          }
        }
      }
    }

    const batchRows = batchConditions.size
      ? await db.inventoryBatch.findMany({
          where: { OR: Array.from(batchConditions.values()) },
          select: { inventoryProductId: true, batchNo: true, expiryDate: true },
        })
      : [];

    const batchExpiryMap = new Map<string, string | null>();
    for (const batch of batchRows) {
      batchExpiryMap.set(batchKey(batch.inventoryProductId, batch.batchNo), toIsoDate(batch.expiryDate));
    }

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
          .map((line) => mapLine(line, batchExpiryMap));

        const componentLines = transaction.lines
          .filter((line) => line.adjustmentDirection === "OUT")
          .map((line) => mapLine(line, batchExpiryMap));

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
