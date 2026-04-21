export type QtyDecimalPlaces = 0 | 2 | 3;
export type MoneyDecimalPlaces = 2 | 3;

export type StockNumberFormatConfig = {
  qtyDecimalPlaces: QtyDecimalPlaces;
  unitCostDecimalPlaces: MoneyDecimalPlaces;
  priceDecimalPlaces: MoneyDecimalPlaces;
};

export const DEFAULT_STOCK_NUMBER_FORMAT_CONFIG: StockNumberFormatConfig = {
  qtyDecimalPlaces: 0,
  unitCostDecimalPlaces: 2,
  priceDecimalPlaces: 2,
};

export const STOCK_STORAGE_DECIMAL_PLACES = {
  qty: 3,
  money: 3,
  conversionRate: 4,
} as const;

function clampToAllowed<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  const parsed = Number(value);
  return allowed.includes(parsed as T) ? (parsed as T) : fallback;
}

export function normalizeQtyDecimalPlaces(value: unknown): QtyDecimalPlaces {
  return clampToAllowed(value, [0, 2, 3] as const, DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.qtyDecimalPlaces);
}

export function normalizeMoneyDecimalPlaces(value: unknown): MoneyDecimalPlaces {
  return clampToAllowed(value, [2, 3] as const, DEFAULT_STOCK_NUMBER_FORMAT_CONFIG.unitCostDecimalPlaces);
}

export function normalizeStockNumberFormatConfig(value: Partial<StockNumberFormatConfig> | null | undefined): StockNumberFormatConfig {
  return {
    qtyDecimalPlaces: normalizeQtyDecimalPlaces(value?.qtyDecimalPlaces),
    unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(value?.unitCostDecimalPlaces),
    priceDecimalPlaces: normalizeMoneyDecimalPlaces(value?.priceDecimalPlaces),
  };
}

export function getNumberInputStep(decimalPlaces: number): string {
  if (decimalPlaces <= 0) return '1';
  return `0.${'0'.repeat(decimalPlaces - 1)}1`;
}

export function roundToDecimalPlaces(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimalPlaces);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNumberByDecimalPlaces(value: string | number | null | undefined, decimalPlaces: number): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return roundToDecimalPlaces(0, decimalPlaces).toFixed(Math.max(0, decimalPlaces));
  }
  return roundToDecimalPlaces(parsed, decimalPlaces).toFixed(Math.max(0, decimalPlaces));
}

export function normalizeInputByDecimalPlaces(value: string | number | null | undefined, decimalPlaces: number, fallback = 0): string {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return formatNumberByDecimalPlaces(fallback, decimalPlaces);
  }
  return formatNumberByDecimalPlaces(parsed, decimalPlaces);
}

export function countDecimalPlaces(value: unknown): number {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 0;

  if (raw.includes('e-')) {
    const [, exponentText] = raw.split('e-');
    const exponent = Number(exponentText);
    if (!Number.isFinite(exponent) || exponent < 0) return 0;
    const mantissa = raw.split('e-')[0];
    const mantissaPlaces = mantissa.includes('.') ? mantissa.split('.')[1].length : 0;
    return mantissaPlaces + exponent;
  }

  if (!raw.includes('.')) return 0;
  return raw.split('.')[1].length;
}

export function parsePositiveNumberWithDecimalPlaces(value: unknown, decimalPlaces: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
  if (countDecimalPlaces(value) > decimalPlaces) {
    throw new Error(`${label} allows maximum ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'}.`);
  }
  return roundToDecimalPlaces(parsed, decimalPlaces);
}

export function parseNonNegativeNumberWithDecimalPlaces(value: unknown, decimalPlaces: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be 0 or greater.`);
  }
  if (countDecimalPlaces(value) > decimalPlaces) {
    throw new Error(`${label} allows maximum ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'}.`);
  }
  return roundToDecimalPlaces(parsed, decimalPlaces);
}

export function toStoredDecimalString(value: unknown, storageDecimalPlaces: number): string {
  const parsed = Number(value ?? 0);
  return roundToDecimalPlaces(parsed, storageDecimalPlaces).toFixed(storageDecimalPlaces);
}
