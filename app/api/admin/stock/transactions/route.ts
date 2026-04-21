import { NextResponse } from "next/server";
import { StockAdjustmentDirection, StockTransactionType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireStockMutationLocks,
  acquireAdvisoryLock,
  assertPositiveQty,
  buildLedgerValues,
  createStoredMoneyDecimal,
  createStoredQtyDecimal,
  buildTransactionNumberLockKey,
  generateStockTransactionNumber,
  getStockBalance,
  isInboundTransaction,
  isOutboundTransaction,
  normalizeStockDate,
} from "@/lib/stock";
import {
  normalizeMoneyDecimalPlaces,
  normalizeQtyDecimalPlaces,
  parseNonNegativeNumberWithDecimalPlaces,
  roundToDecimalPlaces,
  STOCK_STORAGE_DECIMAL_PLACES,
} from "@/lib/stock-format";

type StockLinePayload = {
  inventoryProductId?: string;
  qty?: number;
  uomCode?: string | null;
  unitCost?: number | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  serialNos?: string[] | null;
  remarks?: string | null;
  locationId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  adjustmentDirection?: "IN" | "OUT" | null;
};

function normalizeType(value: unknown) {
  if (value === "OB" || value === "SR" || value === "SI" || value === "SA" || value === "ST" || value === "AS") {
    return value as StockTransactionType;
  }
  throw new Error("Invalid stock transaction type.");
}

function normalizeAdjustmentDirection(value: unknown) {
  if (value === "IN" || value === "OUT") return value as StockAdjustmentDirection;
  return null;
}

function normalizeSerialNumbers(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const serialNo of normalized) {
    const key = serialNo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(serialNo);
  }
  return unique;
}

function normalizeUomCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function resolveConversionRate(product: any, uomCode: string) {
  if (!uomCode || uomCode === product.baseUom) return 1;
  const matched = Array.isArray(product.uomConversions)
    ? product.uomConversions.find((item: any) => item.uomCode.toUpperCase() === uomCode)
    : null;
  if (!matched) {
    throw new Error(`Selected UOM ${uomCode} is invalid for the selected product.`);
  }
  const rate = Number(matched.conversionRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Selected UOM ${uomCode} has invalid conversion rate.`);
  }
  return roundToDecimalPlaces(rate, STOCK_STORAGE_DECIMAL_PLACES.conversionRate);
}

function convertQtyToBase(qty: number, rate: number) {
  return roundToDecimalPlaces(qty * rate, STOCK_STORAGE_DECIMAL_PLACES.qty);
}

function transactionUsesOutboundLocation(
  transactionType: StockTransactionType,
  adjustmentDirection: StockAdjustmentDirection | null,
  line: { locationId: string | null; fromLocationId: string | null }
) {
  if (transactionType === "ST") return line.fromLocationId;
  if (transactionType === "SI") return line.locationId;
  if ((transactionType === "SA" || transactionType === "AS") && adjustmentDirection === "OUT") return line.locationId;
  return null;
}

function transactionUsesInboundLocation(
  transactionType: StockTransactionType,
  adjustmentDirection: StockAdjustmentDirection | null,
  line: { locationId: string | null; toLocationId: string | null }
) {
  if (transactionType === "ST") return line.toLocationId;
  if (transactionType === "OB" || transactionType === "SR") return line.locationId;
  if ((transactionType === "SA" || transactionType === "AS") && adjustmentDirection === "IN") return line.locationId;
  return null;
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
        revisedFrom: { select: { id: true, transactionNo: true } },
        revisions: { select: { id: true } },
        lines: {
          include: {
            inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
            location: { select: { id: true, code: true, name: true } },
            fromLocation: { select: { id: true, code: true, name: true } },
            toLocation: { select: { id: true, code: true, name: true } },
            serialEntries: {
              orderBy: [{ serialNo: "asc" }],
              select: {
                id: true,
                serialNo: true,
              },
            },
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
    const formatConfig = {
      qtyDecimalPlaces: normalizeQtyDecimalPlaces(config?.qtyDecimalPlaces),
      unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(config?.unitCostDecimalPlaces),
      priceDecimalPlaces: normalizeMoneyDecimalPlaces(config?.priceDecimalPlaces),
    };

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
      db.inventoryProduct.findMany({
        where: { id: { in: inventoryProductIds } },
        select: {
          id: true,
          isActive: true,
          trackInventory: true,
          batchTracking: true,
          serialNumberTracking: true,
          baseUom: true,
          uomConversions: { select: { uomCode: true, conversionRate: true } },
        },
      }),
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

      const inputQty = assertPositiveQty(line.qty, "Quantity", formatConfig.qtyDecimalPlaces);
      const uomCode = normalizeUomCode((line as any).uomCode) || product.baseUom;
      const conversionRate = resolveConversionRate(product, uomCode);
      const qty = convertQtyToBase(inputQty, conversionRate);
      const unitCost =
        line.unitCost == null
          ? null
          : parseNonNegativeNumberWithDecimalPlaces(line.unitCost, formatConfig.unitCostDecimalPlaces, "Unit cost");
      const batchNo = typeof line.batchNo === "string" ? line.batchNo.trim().toUpperCase() || null : null;
      const expiryDate = typeof line.expiryDate === "string" && line.expiryDate.trim() ? new Date(line.expiryDate) : null;
      const serialNos = normalizeSerialNumbers(line.serialNos);
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

      if (product.batchTracking && !batchNo) {
        throw new Error("Batch No is required for batch-tracked products.");
      }

      if (expiryDate && Number.isNaN(expiryDate.getTime())) {
        throw new Error("Expiry Date is invalid.");
      }

      if ((transactionType === "SA" || transactionType === "AS") && !adjustmentDirection) {
        throw new Error(`${transactionType === "AS" ? "Stock Assembly" : "Stock Adjustment"} requires adjustment direction IN or OUT.`);
      }

      if (transactionType !== "SA" && transactionType !== "AS" && adjustmentDirection) {
        throw new Error("Adjustment direction is only allowed for Stock Adjustment or Stock Assembly.");
      }

      if (product.serialNumberTracking) {
        if (serialNos.length === 0) {
          throw new Error(`Serial No is required for serial-tracked product.`);
        }
        if (inputQty !== serialNos.length) {
          throw new Error("Serial-tracked lines require quantity to match the number of serial numbers.");
        }
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
        inputQty,
        uomCode,
        unitCost,
        batchNo,
        expiryDate,
        serialNos,
        remarks: typeof line.remarks === "string" ? line.remarks.trim() || null : null,
        locationId,
        fromLocationId,
        toLocationId,
        adjustmentDirection,
        product,
      };
    });

    const created = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, buildTransactionNumberLockKey(transactionType, transactionDate));
      await acquireStockMutationLocks(
        tx,
        normalizedLines.map((line) => ({
          inventoryProductId: line.inventoryProductId,
          batchNo: line.batchNo,
          serialNos: line.serialNos,
          locationId: line.locationId,
          fromLocationId: line.fromLocationId,
          toLocationId: line.toLocationId,
        }))
      );

      const batchKeyMap = new Map<string, string | null>();

      if (!config.allowNegativeStock) {
        for (const line of normalizedLines) {
          const usesOutbound = isOutboundTransaction(transactionType, line.adjustmentDirection);
          if (usesOutbound) {
            const outboundLocationId = transactionUsesOutboundLocation(transactionType, line.adjustmentDirection, line)!;

            if (line.product.serialNumberTracking) {
              const availableCount = await tx.inventorySerial.count({
                where: {
                  inventoryProductId: line.inventoryProductId,
                  currentLocationId: outboundLocationId,
                  status: "IN_STOCK",
                  serialNo: { in: line.serialNos },
                  ...(line.batchNo
                    ? {
                        inventoryBatch: {
                          is: { batchNo: line.batchNo },
                        },
                      }
                    : {}),
                },
              });

              if (availableCount !== line.serialNos.length) {
                throw new Error("One or more selected serial numbers are unavailable at the selected location.");
              }
            } else {
              const balance = await getStockBalance(tx, line.inventoryProductId, outboundLocationId, { batchNo: line.batchNo });
              if (balance < line.qty) {
                throw new Error(
                  `Insufficient stock for ${
                    transactionType === "SI"
                      ? "Stock Issue"
                      : transactionType === "ST"
                        ? "Stock Transfer"
                        : transactionType === "AS"
                          ? "Stock Assembly OUT"
                          : "Stock Adjustment OUT"
                  }.`
                );
              }
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
              qty: createStoredQtyDecimal(line.qty),
              unitCost: line.unitCost == null ? null : createStoredMoneyDecimal(line.unitCost),
              batchNo: line.batchNo,
              expiryDate: line.expiryDate,
              remarks: line.remarks,
              locationId: line.locationId,
              fromLocationId: line.fromLocationId,
              toLocationId: line.toLocationId,
              adjustmentDirection: line.adjustmentDirection,
              serialEntries: line.serialNos.length
                ? {
                    create: line.serialNos.map((serialNo) => ({
                      inventoryProductId: line.inventoryProductId,
                      serialNo,
                    })),
                  }
                : undefined,
            })),
          },
        },
        include: {
          lines: {
            include: {
              serialEntries: true,
            },
          },
        },
      });

      for (const line of transaction.lines) {
        let batchId: string | null = null;
        if (line.batchNo) {
          const batch = await tx.inventoryBatch.upsert({
            where: {
              inventoryProductId_batchNo: {
                inventoryProductId: line.inventoryProductId,
                batchNo: line.batchNo,
              },
            },
            update: {
              expiryDate: line.expiryDate ?? undefined,
            },
            create: {
              inventoryProductId: line.inventoryProductId,
              batchNo: line.batchNo,
              expiryDate: line.expiryDate ?? undefined,
            },
          });
          batchId = batch.id;
          batchKeyMap.set(`${line.inventoryProductId}__${line.batchNo}`, batch.id);
        }

        const qty = createStoredQtyDecimal(line.qty);
        const direction =
          transactionType === "ST"
            ? null
            : transactionType === "OB" ||
              transactionType === "SR" ||
              ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "IN")
              ? "IN"
              : "OUT";

        if (transactionType === "ST") {
          const outValues = buildLedgerValues(qty, "OUT");
          const inValues = buildLedgerValues(qty, "IN");

          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: "OUT",
              ...outValues,
              batchNo: line.batchNo,
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
              batchNo: line.batchNo,
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
        } else {
          const values = buildLedgerValues(qty, direction!);
          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: direction!,
              ...values,
              batchNo: line.batchNo,
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

        const serialEntries = await tx.stockTransactionLineSerial.findMany({
          where: { transactionLineId: line.id },
          orderBy: [{ serialNo: "asc" }],
        });

        if (serialEntries.length > 0) {
          if (
            transactionType === "OB" ||
            transactionType === "SR" ||
            ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "IN")
          ) {
            for (const serialEntry of serialEntries) {
              const existing = await tx.inventorySerial.findUnique({
                where: {
                  inventoryProductId_serialNo: {
                    inventoryProductId: line.inventoryProductId,
                    serialNo: serialEntry.serialNo,
                  },
                },
              });

              let serialRecord;
              if (existing) {
                if (existing.status === "IN_STOCK") {
                  throw new Error(`Serial No ${serialEntry.serialNo} is already in stock for this product.`);
                }
                serialRecord = await tx.inventorySerial.update({
                  where: { id: existing.id },
                  data: {
                    inventoryBatchId: batchId,
                    currentLocationId: line.locationId!,
                    status: "IN_STOCK",
                  },
                });
              } else {
                serialRecord = await tx.inventorySerial.create({
                  data: {
                    inventoryProductId: line.inventoryProductId,
                    inventoryBatchId: batchId,
                    serialNo: serialEntry.serialNo,
                    currentLocationId: line.locationId!,
                    status: "IN_STOCK",
                  },
                });
              }

              await tx.stockTransactionLineSerial.update({
                where: { id: serialEntry.id },
                data: {
                  inventorySerialId: serialRecord.id,
                  inventoryBatchId: batchId,
                },
              });
            }
          }

          if (
            transactionType === "SI" ||
            ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "OUT")
          ) {
            for (const serialEntry of serialEntries) {
              const serialRecord = await tx.inventorySerial.findUnique({
                where: {
                  inventoryProductId_serialNo: {
                    inventoryProductId: line.inventoryProductId,
                    serialNo: serialEntry.serialNo,
                  },
                },
              });

              if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== line.locationId) {
                throw new Error(`Serial No ${serialEntry.serialNo} is not available at the selected location.`);
              }

              await tx.inventorySerial.update({
                where: { id: serialRecord.id },
                data: {
                  status: "OUT_OF_STOCK",
                  currentLocationId: null,
                },
              });

              await tx.stockTransactionLineSerial.update({
                where: { id: serialEntry.id },
                data: {
                  inventorySerialId: serialRecord.id,
                  inventoryBatchId: serialRecord.inventoryBatchId,
                },
              });
            }
          }

          if (transactionType === "ST") {
            for (const serialEntry of serialEntries) {
              const serialRecord = await tx.inventorySerial.findUnique({
                where: {
                  inventoryProductId_serialNo: {
                    inventoryProductId: line.inventoryProductId,
                    serialNo: serialEntry.serialNo,
                  },
                },
              });

              if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== line.fromLocationId) {
                throw new Error(`Serial No ${serialEntry.serialNo} is not available at the selected source location.`);
              }

              await tx.inventorySerial.update({
                where: { id: serialRecord.id },
                data: {
                  currentLocationId: line.toLocationId!,
                  inventoryBatchId: batchId ?? serialRecord.inventoryBatchId,
                  status: "IN_STOCK",
                },
              });

              await tx.stockTransactionLineSerial.update({
                where: { id: serialEntry.id },
                data: {
                  inventorySerialId: serialRecord.id,
                  inventoryBatchId: batchId ?? serialRecord.inventoryBatchId,
                },
              });
            }
          }
        }
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
              serialEntries: {
                orderBy: [{ serialNo: "asc" }],
                include: {
                  inventorySerial: { select: { id: true, serialNo: true, status: true } },
                },
              },
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
