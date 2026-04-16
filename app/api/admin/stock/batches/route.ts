import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const inventoryProductId = searchParams.get("inventoryProductId")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;
    const direction = searchParams.get("direction")?.trim() || "inbound";
    const q = searchParams.get("q")?.trim().toLowerCase() || undefined;

    if (!inventoryProductId) {
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
          balance: null,
        })),
      });
    }

    if (direction === "outbound" && locationId) {
      const grouped = await db.stockLedger.groupBy({
        by: ["batchNo"],
        where: {
          inventoryProductId,
          locationId,
          batchNo: { not: null },
        },
        _sum: {
          qtyIn: true,
          qtyOut: true,
        },
      });

      const positiveRows = grouped
        .map((row) => {
          const qtyIn = Number(row._sum.qtyIn ?? 0);
          const qtyOut = Number(row._sum.qtyOut ?? 0);
          return {
            batchNo: row.batchNo,
            balance: Math.round((qtyIn - qtyOut + Number.EPSILON) * 100) / 100,
          };
        })
        .filter((row) => !!row.batchNo && row.balance > 0);

      const batchNos = positiveRows.map((row) => row.batchNo!).filter((value) => !q || value.toLowerCase().includes(q));

      const batches = batchNos.length
        ? await db.inventoryBatch.findMany({
            where: {
              inventoryProductId,
              batchNo: { in: batchNos },
            },
            select: {
              id: true,
              inventoryProductId: true,
              batchNo: true,
              expiryDate: true,
            },
          })
        : [];

      const batchMap = new Map(batches.map((item) => [item.batchNo, item]));

      const items = positiveRows
        .filter((row) => batchMap.has(row.batchNo!))
        .sort((a, b) => String(a.batchNo).localeCompare(String(b.batchNo)))
        .map((row) => {
          const batch = batchMap.get(row.batchNo!)!;
          return {
            id: batch.id,
            inventoryProductId: batch.inventoryProductId,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate ? batch.expiryDate.toISOString().slice(0, 10) : null,
            balance: row.balance,
          };
        });

      return NextResponse.json({ ok: true, items });
    }

    const items = await db.inventoryBatch.findMany({
      where: {
        inventoryProductId,
        ...(q
          ? {
              batchNo: {
                contains: q,
                mode: "insensitive",
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        inventoryProductId: true,
        batchNo: true,
        expiryDate: true,
      },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      items: items.map((item) => ({
        ...item,
        expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
        balance: null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load batches." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
