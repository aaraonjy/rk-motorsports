export type TaxCalculationMethodValue = "EXCLUSIVE" | "INCLUSIVE";
export type TaxCalculationModeValue = "TRANSACTION" | "LINE_ITEM";

export type TaxBreakdownInput = {
  subtotal: number;
  discount?: number;
  taxRate?: number | null;
  calculationMethod?: TaxCalculationMethodValue | null;
  taxEnabled?: boolean;
};

export type TaxBreakdownResult = {
  subtotal: number;
  discount: number;
  taxableSubtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotalAfterTax: number;
  calculationMethod: TaxCalculationMethodValue | null;
  isTaxApplied: boolean;
};

export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeTaxRate(value?: number | null) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, roundMoney(Number(value)));
}

export function normalizeTaxCalculationMode(value?: string | null): TaxCalculationModeValue {
  return value === "LINE_ITEM" ? "LINE_ITEM" : "TRANSACTION";
}

export function calculateTaxBreakdown(input: TaxBreakdownInput): TaxBreakdownResult {
  const subtotal = Math.max(0, roundMoney(Number(input.subtotal) || 0));
  const discount = Math.max(0, roundMoney(Number(input.discount) || 0));
  const taxableSubtotal = Math.max(0, roundMoney(subtotal - discount));
  const taxRate = normalizeTaxRate(input.taxRate);
  const calculationMethod = input.calculationMethod ?? null;
  const shouldApplyTax = Boolean(input.taxEnabled && taxRate > 0 && calculationMethod);

  if (!shouldApplyTax || !calculationMethod) {
    return {
      subtotal,
      discount,
      taxableSubtotal,
      taxRate,
      taxAmount: 0,
      grandTotalAfterTax: taxableSubtotal,
      calculationMethod: null,
      isTaxApplied: false,
    };
  }

  const taxAmount =
    calculationMethod === "INCLUSIVE"
      ? roundMoney(taxableSubtotal * (taxRate / (100 + taxRate)))
      : roundMoney(taxableSubtotal * (taxRate / 100));

  const grandTotalAfterTax =
    calculationMethod === "INCLUSIVE"
      ? taxableSubtotal
      : roundMoney(taxableSubtotal + taxAmount);

  return {
    subtotal,
    discount,
    taxableSubtotal,
    taxRate,
    taxAmount,
    grandTotalAfterTax,
    calculationMethod,
    isTaxApplied: true,
  };
}

export function getTaxDisplayLabel(input: {
  code?: string | null;
  description?: string | null;
  rate?: number | null;
}) {
  const code = (input.code || "").trim();
  const description = (input.description || "").trim();
  const rate = normalizeTaxRate(input.rate);

  if (description && code) {
    return `${code} - ${description} (${rate.toFixed(2)}%)`;
  }

  if (code) {
    return `${code} (${rate.toFixed(2)}%)`;
  }

  return description || "Tax";
}
