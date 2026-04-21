import { Prisma, StockAdjustmentDirection, StockTransactionType } from "@prisma/client";
import {
  DEFAULT_STOCK_NUMBER_FORMAT_CONFIG,
  STOCK_STORAGE_DECIMAL_PLACES,
  normalizeQtyDecimalPlaces,
  roundToDecimalPlaces,
  toStoredDecimalString,
} from "@/lib/stock-format";

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

export function assertPositiveQty(
  value: unknown,
  label = "Quantity",
  decimalPlaces = DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.qtyDecimalPlaces
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }

  const allowedPlaces = normalizeQtyDecimalPlaces(decimalPlaces);
  const raw = String(value ?? "").trim();
  const actualPlaces = raw.includes(".") ? raw.split(".")[1].length : 0;
  if (actualPlaces > allowedPlaces) {
    throw new Error(`${label} allows maximum ${allowedPlaces} decimal places.`);
  }

  return roundToDecimalPlaces(parsed, allowedPlaces);
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
  return roundToDecimalPlaces(qtyIn - qtyOut, STOCK_STORAGE_DECIMAL_PLACES.qty);
}

function hashLockKey(input: string) {
  let hash = BigInt("1469598103934665603");
  const prime = BigInt("1099511628211");
  const mod = BigInt("18446744073709551616");
  const signedThreshold = BigInt("9223372036854775808");

  for (const ch of input) {
    hash ^= BigInt(ch.codePointAt(0) ?? 0);
    hash = (hash * prime) % mod;
  }

  if (hash >= signedThreshold) {
    hash -= mod;
  }

  return hash;
}

export async function acquireAdvisoryLock(tx: any, key: string) {
  const hashed = hashLockKey(key);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hashed})`;
}

export function buildTransactionNumberLockKey(
  transactionType: StockTransactionType,
  transactionDate: Date
) {
  const y = transactionDate.getFullYear();
  const m = String(transactionDate.getMonth() + 1).padStart(2, "0");
  const d = String(transactionDate.getDate()).padStart(2, "0");
  return `stock-docno:${transactionType}:${y}${m}${d}`;
}

export function buildTransactionEntityLockKey(transactionId: string) {
  return `stock-transaction:${transactionId}`;
}

export function buildStockBalanceLockKey(
  inventoryProductId: string,
  locationId: string,
  batchNo?: string | null
) {
  return `stock-balance:${inventoryProductId}:${locationId}:${String(batchNo || "").trim().toUpperCase()}`;
}

export function buildSerialLockKey(
  inventoryProductId: string,
  serialNo: string
) {
  return `stock-serial:${inventoryProductId}:${serialNo.trim().toUpperCase()}`;
}

type StockLockLine = {
  inventoryProductId: string;
  batchNo?: string | null;
  serialNos?: string[] | null;
  locationId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
};

export async function acquireStockMutationLocks(
  tx: any,
  lines: StockLockLine[]
) {
  const keys = new Set<string>();

  for (const line of lines) {
    const inventoryProductId = String(line.inventoryProductId || "").trim();
    if (!inventoryProductId) continue;

    const serialNos = Array.isArray(line.serialNos) ? line.serialNos : [];
    if (serialNos.length > 0) {
      for (const serialNo of serialNos) {
        const normalizedSerialNo = String(serialNo || "").trim();
        if (!normalizedSerialNo) continue;
        keys.add(buildSerialLockKey(inventoryProductId, normalizedSerialNo));
      }
      continue;
    }

    for (const locationId of [line.locationId, line.fromLocationId, line.toLocationId]) {
      const normalizedLocationId = String(locationId || "").trim();
      if (!normalizedLocationId) continue;
      keys.add(buildStockBalanceLockKey(inventoryProductId, normalizedLocationId, line.batchNo));
    }
  }

  for (const key of Array.from(keys).sort()) {
    await acquireAdvisoryLock(tx, key);
  }
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

export function createStoredQtyDecimal(value: unknown) {
  return new Prisma.Decimal(toStoredDecimalString(value, STOCK_STORAGE_DECIMAL_PLACES.qty));
}

export function createStoredMoneyDecimal(value: unknown) {
  return new Prisma.Decimal(toStoredDecimalString(value, STOCK_STORAGE_DECIMAL_PLACES.money));
}

export function getUomConversionRateForProduct(
  product: { baseUom: string; uomConversions?: Array<{ uomCode: string; conversionRate: number | string | Prisma.Decimal }> },
  uomCode?: string | null
) {
  const normalized = String(uomCode || product.baseUom).trim().toUpperCase();
  if (!normalized || normalized === product.baseUom) return 1;
  const matched = Array.isArray(product.uomConversions)
    ? product.uomConversions.find((item) => item.uomCode.toUpperCase() === normalized)
    : null;
  if (!matched) {
    throw new Error(`Selected UOM ${normalized} is invalid for the selected product.`);
  }
  const rate = Number(matched.conversionRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Selected UOM ${normalized} has invalid conversion rate.`);
  }
  return roundToDecimalPlaces(rate, STOCK_STORAGE_DECIMAL_PLACES.conversionRate);
}

export function convertQtyToBaseUom(
  qty: number,
  rate: number
) {
  return roundToDecimalPlaces(qty * rate, STOCK_STORAGE_DECIMAL_PLACES.qty);
}
