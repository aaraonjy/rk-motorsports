import { Prisma, StockAdjustmentDirection, StockTransactionType } from "@prisma/client";

const DECIMAL_ZERO = new Prisma.Decimal(0);

type StockBalanceOptions = {
  batchNo?: string | null;
};

export function toDecimal(value: string | number | Prisma.Decimal) {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

export function decimalToNumber(value: Prisma.Decimal | string | number | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

export function normalizeStockDate(input?: string | null) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid transaction date.");
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

export function assertPositiveQty(value: unknown, label = "Quantity") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export async function getStockBalance(
  tx: any,
  inventoryProductId: string,
  locationId: string,
  options?: StockBalanceOptions
) {
  const aggregate = await tx.stockLedger.aggregate({
    where: {
      inventoryProductId,
      locationId,
      ...(options?.batchNo ? { batchNo: options.batchNo } : {}),
    },
    _sum: {
      qtyIn: true,
      qtyOut: true,
    },
  });

  const qtyIn = decimalToNumber(aggregate._sum.qtyIn);
  const qtyOut = decimalToNumber(aggregate._sum.qtyOut);
  return Math.round((qtyIn - qtyOut + Number.EPSILON) * 100) / 100;
}

export async function generateStockTransactionNumber(
  tx: any,
  transactionType: StockTransactionType,
  transactionDate: Date
) {
  const y = transactionDate.getFullYear();
  const m = String(transactionDate.getMonth() + 1).padStart(2, "0");
  const d = String(transactionDate.getDate()).padStart(2, "0");
  const datePart = `${y}${m}${d}`;
  const prefix = `${transactionType}-${datePart}`;

  const count = await tx.stockTransaction.count({
    where: {
      transactionType,
      transactionDate,
    },
  });

  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export function isInboundTransaction(type: StockTransactionType, adjustmentDirection?: StockAdjustmentDirection | null) {
  if (type === "OB" || type === "SR") return true;
  if ((type === "SA" || type === "AS") && adjustmentDirection === "IN") return true;
  return false;
}

export function isOutboundTransaction(type: StockTransactionType, adjustmentDirection?: StockAdjustmentDirection | null) {
  if (type === "SI") return true;
  if ((type === "SA" || type === "AS") && adjustmentDirection === "OUT") return true;
  return false;
}

export function buildLedgerValues(
  qty: Prisma.Decimal,
  direction: "IN" | "OUT"
) {
  return {
    qty,
    qtyIn: direction === "IN" ? qty : DECIMAL_ZERO,
    qtyOut: direction === "OUT" ? qty : DECIMAL_ZERO,
  };
}
