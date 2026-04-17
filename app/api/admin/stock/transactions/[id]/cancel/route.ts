import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import { buildLedgerValues, getStockBalance } from "@/lib/stock";

type Params = { params: Promise<{ id: string }> };

function roundQty(value: Prisma.Decimal | number | string | null | undefined) {
  return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
}

export async function POST(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const cancelReason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    const cancelled = await db.$transaction(async (tx) => {
      const transaction = await tx.stockTransaction.findUnique({
        where: { id },
        include: {
          lines: {
            include: {
              serialEntries: true,
            },
          },
        },
      });

      if (!transaction) throw new Error("Stock transaction not found.");
      if (transaction.status === "CANCELLED") throw new Error("This stock transaction is already cancelled.");

      for (const line of transaction.lines) {
        const qty = roundQty(line.qty);
        const batchNo = line.batchNo || undefined;

        if (line.serialEntries.length > 0) {
          for (const serialEntry of line.serialEntries) {
            const serial = serialEntry.inventorySerialId
              ? await tx.inventorySerial.findUnique({ where: { id: serialEntry.inventorySerialId } })
              : await tx.inventorySerial.findUnique({
                  where: {
                    inventoryProductId_serialNo: {
                      inventoryProductId: line.inventoryProductId,
                      serialNo: serialEntry.serialNo,
                    },
                  },
                });

            if (!serial) {
              throw new Error(`Serial No ${serialEntry.serialNo} cannot be found for cancellation.`);
            }

            if (transaction.transactionType === "OB" || transaction.transactionType === "SR" || (transaction.transactionType === "SA" && line.adjustmentDirection === "IN")) {
              if (serial.status !== "IN_STOCK" || serial.currentLocationId !== line.locationId) {
                throw new Error(`Serial No ${serialEntry.serialNo} cannot be cancelled because later stock activity already changed it.`);
              }
            }

            if (transaction.transactionType === "SI" || (transaction.transactionType === "SA" && line.adjustmentDirection === "OUT")) {
              if (serial.status !== "OUT_OF_STOCK") {
                throw new Error(`Serial No ${serialEntry.serialNo} cannot be cancelled because it is no longer in outbound state.`);
              }
            }

            if (transaction.transactionType === "ST") {
              if (serial.status !== "IN_STOCK" || serial.currentLocationId !== line.toLocationId) {
                throw new Error(`Serial No ${serialEntry.serialNo} cannot be cancelled because it is no longer at the destination location.`);
              }
            }
          }
        } else {
          if (transaction.transactionType === "OB" || transaction.transactionType === "SR" || (transaction.transactionType === "SA" && line.adjustmentDirection === "IN")) {
            const balance = await getStockBalance(tx, line.inventoryProductId, line.locationId!, { batchNo });
            if (balance < qty) {
              throw new Error(`Transaction ${transaction.transactionNo} cannot be cancelled because the current stock balance is no longer sufficient to reverse it.`);
            }
          }

          if (transaction.transactionType === "ST") {
            const destinationBalance = await getStockBalance(tx, line.inventoryProductId, line.toLocationId!, { batchNo });
            if (destinationBalance < qty) {
              throw new Error(`Transaction ${transaction.transactionNo} cannot be cancelled because the destination stock balance is no longer sufficient to reverse it.`);
            }
          }
        }
      }

      for (const line of transaction.lines) {
        const qty = new Prisma.Decimal(roundQty(line.qty).toFixed(2));
        const remarks = line.remarks ?? transaction.remarks ?? "Cancellation reversal";

        if (transaction.transactionType === "ST") {
          const outValues = buildLedgerValues(qty, "OUT");
          const inValues = buildLedgerValues(qty, "IN");

          await tx.stockLedger.create({
            data: {
              movementDate: new Date(),
              movementType: transaction.transactionType,
              movementDirection: "OUT",
              ...outValues,
              batchNo: line.batchNo,
              inventoryProductId: line.inventoryProductId,
              locationId: line.toLocationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: "Cancellation reversal",
              sourceType: "MANUAL_STOCK_TRANSACTION_CANCEL",
              sourceId: transaction.id,
              remarks,
            },
          });

          await tx.stockLedger.create({
            data: {
              movementDate: new Date(),
              movementType: transaction.transactionType,
              movementDirection: "IN",
              ...inValues,
              batchNo: line.batchNo,
              inventoryProductId: line.inventoryProductId,
              locationId: line.fromLocationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: "Cancellation reversal",
              sourceType: "MANUAL_STOCK_TRANSACTION_CANCEL",
              sourceId: transaction.id,
              remarks,
            },
          });
        } else {
          const reverseDirection = transaction.transactionType === "SI" || (transaction.transactionType === "SA" && line.adjustmentDirection === "OUT") ? "IN" : "OUT";
          const ledgerValues = buildLedgerValues(qty, reverseDirection);
          await tx.stockLedger.create({
            data: {
              movementDate: new Date(),
              movementType: transaction.transactionType,
              movementDirection: reverseDirection,
              ...ledgerValues,
              batchNo: line.batchNo,
              inventoryProductId: line.inventoryProductId,
              locationId: line.locationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: "Cancellation reversal",
              sourceType: "MANUAL_STOCK_TRANSACTION_CANCEL",
              sourceId: transaction.id,
              remarks,
            },
          });
        }

        if (line.serialEntries.length > 0) {
          for (const serialEntry of line.serialEntries) {
            const serial = serialEntry.inventorySerialId
              ? await tx.inventorySerial.findUnique({ where: { id: serialEntry.inventorySerialId } })
              : await tx.inventorySerial.findUnique({
                  where: {
                    inventoryProductId_serialNo: {
                      inventoryProductId: line.inventoryProductId,
                      serialNo: serialEntry.serialNo,
                    },
                  },
                });

            if (!serial) continue;

            if (transaction.transactionType === "OB" || transaction.transactionType === "SR" || (transaction.transactionType === "SA" && line.adjustmentDirection === "IN")) {
              await tx.inventorySerial.update({
                where: { id: serial.id },
                data: {
                  status: "OUT_OF_STOCK",
                  currentLocationId: null,
                },
              });
            } else if (transaction.transactionType === "SI" || (transaction.transactionType === "SA" && line.adjustmentDirection === "OUT")) {
              await tx.inventorySerial.update({
                where: { id: serial.id },
                data: {
                  status: "IN_STOCK",
                  currentLocationId: line.locationId,
                },
              });
            } else if (transaction.transactionType === "ST") {
              await tx.inventorySerial.update({
                where: { id: serial.id },
                data: {
                  status: "IN_STOCK",
                  currentLocationId: line.fromLocationId,
                },
              });
            }
          }
        }
      }

      const updated = await tx.stockTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByAdminId: admin.id,
          cancelReason,
        },
        include: {
          createdByAdmin: { select: { id: true, name: true, email: true } },
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          lines: {
            include: {
              inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
              location: { select: { id: true, code: true, name: true } },
              fromLocation: { select: { id: true, code: true, name: true } },
              toLocation: { select: { id: true, code: true, name: true } },
              serialEntries: { orderBy: [{ serialNo: "asc" }], select: { id: true, serialNo: true } },
            },
          },
        },
      });

      return updated;
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Stock Transactions",
      action: "CANCEL",
      entityType: "StockTransaction",
      entityId: cancelled.id,
      entityCode: cancelled.transactionNo,
      description: `${admin.name} cancelled stock transaction ${cancelled.transactionNo}.`,
      newValues: {
        status: cancelled.status,
        cancelReason,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, transaction: cancelled });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to cancel stock transaction." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
