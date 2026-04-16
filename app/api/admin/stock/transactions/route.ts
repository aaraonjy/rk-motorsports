import { NextResponse } from "next/server";
import { Prisma, StockAdjustmentDirection, StockTransactionType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  assertPositiveQty,
  buildLedgerValues,
  generateStockTransactionNumber,
  getStockBalance,
  normalizeStockDate,
} from "@/lib/stock";

type StockLinePayload = {
  inventoryProductId?: string;
  qty?: number;
  unitCost?: number | null;
  remarks?: string | null;
  locationId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  adjustmentDirection?: "IN" | "OUT" | null;
};

function normalizeType(value: unknown) {
  if (value === "OB" || value === "SR" || value === "SI" || value === "SA" || value === "ST") {
    return value as StockTransactionType;
  }
  throw new Error("Invalid stock transaction type.");
}

function normalizeAdjustmentDirection(value: unknown) {
  if (value === "IN" || value === "OUT") return value as StockAdjustmentDirection;
  return null;
}

function normalizeUnitCost(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Unit cost must be 0 or greater.");
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("transactionType")?.trim() || undefined;
    const q = searchParams.get("q")?.trim() || undefined;
    const rows = await db.stockTransaction.findMany({
      where: {
        ...(type ? { transactionType: type as StockTransactionType } : {}),
        ...(q
          ? {
              OR: [
                { transactionNo: { contains: q, mode: "insensitive" } },
                { reference: { contains: q, mode: "insensitive" } },
                { remarks: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        lines: {
          include: {
            inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
            location: { select: { id: true, code: true, name: true } },
            fromLocation: { select: { id: true, code: true, name: true } },
            toLocation: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, transactions: rows });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock transactions." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const transactionType = normalizeType(body.transactionType);
    const transactionDate = normalizeStockDate(body.transactionDate);
    const reference = typeof body.reference === "string" ? body.reference.trim() : null;
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : null;
    const rawLines = Array.isArray(body.lines) ? (body.lines as StockLinePayload[]) : [];

    if (rawLines.length === 0) {
      return NextResponse.json({ ok: false, error: "Please provide at least one stock line." }, { status: 400 });
    }

    const config = await db.stockConfiguration.findUnique({ where: { id: "default" } });
    if (!config?.stockModuleEnabled) {
      return NextResponse.json({ ok: false, error: "Stock module is disabled." }, { status: 400 });
    }

    const inventoryProductIds = Array.from(new Set(rawLines.map((line) => String(line.inventoryProductId || "").trim()).filter(Boolean)));
    const locationIds = Array.from(
      new Set(
        rawLines
          .flatMap((line) => [line.locationId, line.fromLocationId, line.toLocationId])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );

    const [products, locations] = await Promise.all([
      db.inventoryProduct.findMany({ where: { id: { in: inventoryProductIds } } }),
      db.stockLocation.findMany({ where: { id: { in: locationIds } } }),
    ]);

    const productMap = new Map(products.map((item) => [item.id, item]));
    const locationMap = new Map(locations.map((item) => [item.id, item]));

    const normalizedLines = rawLines.map((line) => {
      const inventoryProductId = String(line.inventoryProductId || "").trim();
      const product = productMap.get(inventoryProductId);
      if (!product || !product.isActive || !product.trackInventory) {
        throw new Error("Selected stock item is invalid, inactive, or not tracked by inventory.");
      }

      const qty = assertPositiveQty(line.qty);
      const unitCost = normalizeUnitCost(line.unitCost);
      const adjustmentDirection = normalizeAdjustmentDirection(line.adjustmentDirection);
      const locationId = String(line.locationId || "").trim() || null;
      const fromLocationId = String(line.fromLocationId || "").trim() || null;
      const toLocationId = String(line.toLocationId || "").trim() || null;

      if (transactionType === "ST") {
        if (!fromLocationId || !toLocationId) throw new Error("Stock Transfer requires both source and destination locations.");
        if (fromLocationId === toLocationId) throw new Error("Stock Transfer source and destination cannot be the same.");
      } else {
        if (!locationId) throw new Error("This stock transaction requires a location.");
      }

      if (transactionType === "SA" && !adjustmentDirection) {
        throw new Error("Stock Adjustment requires adjustment direction IN or OUT.");
      }

      if (transactionType !== "SA" && adjustmentDirection) {
        throw new Error("Adjustment direction is only allowed for Stock Adjustment.");
      }

      for (const locationRef of [locationId, fromLocationId, toLocationId]) {
        if (!locationRef) continue;
        const location = locationMap.get(locationRef);
        if (!location || !location.isActive) {
          throw new Error("Selected stock location is invalid or inactive.");
        }
      }

      return {
        inventoryProductId,
        qty,
        unitCost,
        remarks: typeof line.remarks === "string" ? line.remarks.trim() || null : null,
        locationId,
        fromLocationId,
        toLocationId,
        adjustmentDirection,
      };
    });

    const created = await db.$transaction(async (tx) => {
      if (!config.allowNegativeStock) {
        for (const line of normalizedLines) {
          if (transactionType === "SI") {
            const balance = await getStockBalance(tx, line.inventoryProductId, line.locationId!);
            if (balance < line.qty) {
              throw new Error("Insufficient stock for Stock Issue.");
            }
          }
          if (transactionType === "ST") {
            const balance = await getStockBalance(tx, line.inventoryProductId, line.fromLocationId!);
            if (balance < line.qty) {
              throw new Error("Insufficient stock for Stock Transfer.");
            }
          }
          if (transactionType === "SA" && line.adjustmentDirection === "OUT") {
            const balance = await getStockBalance(tx, line.inventoryProductId, line.locationId!);
            if (balance < line.qty) {
              throw new Error("Insufficient stock for Stock Adjustment OUT.");
            }
          }
        }
      }

      const transactionNo = await generateStockTransactionNumber(tx, transactionType, transactionDate);

      const transaction = await tx.stockTransaction.create({
        data: {
          transactionNo,
          transactionType,
          transactionDate,
          reference,
          remarks,
          createdByAdminId: admin.id,
          lines: {
            create: normalizedLines.map((line) => ({
              inventoryProductId: line.inventoryProductId,
              qty: new Prisma.Decimal(line.qty.toFixed(2)),
              unitCost: line.unitCost == null ? null : new Prisma.Decimal(line.unitCost.toFixed(2)),
              remarks: line.remarks,
              locationId: line.locationId,
              fromLocationId: line.fromLocationId,
              toLocationId: line.toLocationId,
              adjustmentDirection: line.adjustmentDirection,
            })),
          },
        },
        include: { lines: true },
      });

      for (const line of transaction.lines) {
        const qty = new Prisma.Decimal(Number(line.qty).toFixed(2));

        if (transactionType === "ST") {
          const outValues = buildLedgerValues(qty, "OUT");
          const inValues = buildLedgerValues(qty, "IN");

          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: "OUT",
              ...outValues,
              inventoryProductId: line.inventoryProductId,
              locationId: line.fromLocationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: transaction.reference,
              sourceType: "MANUAL_STOCK_TRANSACTION",
              sourceId: transaction.id,
              remarks: line.remarks ?? transaction.remarks,
            },
          });

          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: "IN",
              ...inValues,
              inventoryProductId: line.inventoryProductId,
              locationId: line.toLocationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: transaction.reference,
              sourceType: "MANUAL_STOCK_TRANSACTION",
              sourceId: transaction.id,
              remarks: line.remarks ?? transaction.remarks,
            },
          });

          continue;
        }

        const direction =
          transactionType === "OB" || transactionType === "SR" || (transactionType === "SA" && line.adjustmentDirection === "IN")
            ? "IN"
            : "OUT";

        const values = buildLedgerValues(qty, direction);
        await tx.stockLedger.create({
          data: {
            movementDate: transaction.transactionDate,
            movementType: transaction.transactionType,
            movementDirection: direction,
            ...values,
            inventoryProductId: line.inventoryProductId,
            locationId: line.locationId!,
            transactionId: transaction.id,
            transactionLineId: line.id,
            referenceNo: transaction.transactionNo,
            referenceText: transaction.reference,
            sourceType: "MANUAL_STOCK_TRANSACTION",
            sourceId: transaction.id,
            remarks: line.remarks ?? transaction.remarks,
          },
        });
      }

      return tx.stockTransaction.findUnique({
        where: { id: transaction.id },
        include: {
          createdByAdmin: { select: { id: true, name: true, email: true } },
          lines: {
            include: {
              inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
              location: { select: { id: true, code: true, name: true } },
              fromLocation: { select: { id: true, code: true, name: true } },
              toLocation: { select: { id: true, code: true, name: true } },
            },
          },
        },
      });
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Stock Transactions",
      action: "CREATE",
      entityType: "StockTransaction",
      entityId: created?.id,
      entityCode: created?.transactionNo,
      description: `${admin.name} created stock transaction ${created?.transactionNo}.`,
      newValues: {
        transactionType,
        transactionDate: transactionDate.toISOString(),
        reference,
        remarks,
        lineCount: normalizedLines.length,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, transaction: created });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create stock transaction." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
