import type { CustomerAccountNoFormat, PrismaClient } from "@prisma/client";
import {
  CUSTOMER_ACCOUNT_FORMAT_OPTIONS,
  DEFAULT_ACCOUNT_CONFIGURATION_ID,
  DEFAULT_CUSTOMER_ACCOUNT_FORMAT,
  getCustomerAccountFormatOption,
} from "@/lib/customer-account";

type SupplierAccountDb = PrismaClient;

export { DEFAULT_ACCOUNT_CONFIGURATION_ID };

export const DEFAULT_SUPPLIER_ACCOUNT_PREFIX = "4000";
export const DEFAULT_SUPPLIER_ACCOUNT_FORMAT: CustomerAccountNoFormat = DEFAULT_CUSTOMER_ACCOUNT_FORMAT;
export const SUPPLIER_ACCOUNT_FORMAT_OPTIONS = CUSTOMER_ACCOUNT_FORMAT_OPTIONS;

export function normalizeSupplierAccountPrefix(value: unknown) {
  return String(value || "").trim().replace(/\/$/, "").toUpperCase();
}

export function normalizeSupplierAccountFormat(value: unknown): CustomerAccountNoFormat {
  const raw = String(value || "").trim();
  const matched = SUPPLIER_ACCOUNT_FORMAT_OPTIONS.find((option) => option.value === raw);
  return matched?.value || DEFAULT_SUPPLIER_ACCOUNT_FORMAT;
}

export function validateSupplierAccountConfiguration(input: {
  supplierAccountPrefix: string;
  supplierAccountNoFormat: CustomerAccountNoFormat;
}) {
  const prefix = normalizeSupplierAccountPrefix(input.supplierAccountPrefix);
  const formatOption = getCustomerAccountFormatOption(input.supplierAccountNoFormat);

  if (!prefix) return "Supplier A/C prefix is required.";
  if (!/^[A-Z0-9]+$/.test(prefix)) return "Supplier A/C prefix can only contain letters and numbers.";
  if (prefix.length !== formatOption.prefixLength) return `Selected supplier format requires a ${formatOption.prefixLength}-character prefix.`;
  return null;
}

export function getSupplierInitial(name: string) {
  const initial = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "X";
}

export function getSupplierAccountSequenceDigits(format: CustomerAccountNoFormat) {
  const formatOption = getCustomerAccountFormatOption(format);
  return Math.max(1, formatOption.suffixLength - 1);
}

export function getSupplierAccountFixedPrefix(input: {
  supplierAccountPrefix: string;
  supplierName: string;
}) {
  const prefix = normalizeSupplierAccountPrefix(input.supplierAccountPrefix);
  const initial = getSupplierInitial(input.supplierName);
  return `${prefix}/${initial}`;
}

export async function getSupplierAccountConfiguration(db: SupplierAccountDb) {
  const config = await db.accountConfiguration.findUnique({ where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID } });

  return {
    supplierAccountPrefix: config?.supplierAccountPrefix || DEFAULT_SUPPLIER_ACCOUNT_PREFIX,
    supplierAccountNoFormat: config?.supplierAccountNoFormat || DEFAULT_SUPPLIER_ACCOUNT_FORMAT,
  };
}

export async function generateNextSupplierAccountNo(db: SupplierAccountDb, supplierName: string) {
  const config = await getSupplierAccountConfiguration(db);
  const prefix = normalizeSupplierAccountPrefix(config.supplierAccountPrefix);
  const formatOption = getCustomerAccountFormatOption(config.supplierAccountNoFormat);
  const initial = getSupplierInitial(supplierName);
  const sequenceDigits = Math.max(1, formatOption.suffixLength - 1);
  const accountNoPrefix = `${prefix}/${initial}`;

  const latestSupplier = await db.supplier.findFirst({
    where: { supplierAccountNo: { startsWith: accountNoPrefix } },
    select: { supplierAccountNo: true },
    orderBy: { supplierAccountNo: "desc" },
  });

  const latestSequenceText = latestSupplier?.supplierAccountNo?.slice(accountNoPrefix.length) || "";
  const latestSequence = Number(latestSequenceText);
  const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;

  return `${accountNoPrefix}${String(nextSequence).padStart(sequenceDigits, "0")}`;
}

export async function resolveSupplierAccountNo(input: {
  db: SupplierAccountDb;
  supplierName: string;
  overrideAccountNo?: string | null;
  excludeSupplierId?: string | null;
}) {
  const generated = await generateNextSupplierAccountNo(input.db, input.supplierName);
  const overrideAccountNo = String(input.overrideAccountNo || "").trim().toUpperCase();
  const supplierAccountNo = overrideAccountNo || generated;
  const config = await getSupplierAccountConfiguration(input.db);
  const fixedPrefix = getSupplierAccountFixedPrefix({
    supplierAccountPrefix: config.supplierAccountPrefix,
    supplierName: input.supplierName,
  });
  const sequenceDigits = getSupplierAccountSequenceDigits(config.supplierAccountNoFormat);
  const suffix = supplierAccountNo.slice(fixedPrefix.length);

  if (!supplierAccountNo.startsWith(fixedPrefix)) {
    return { ok: false as const, error: `A/C No. must start with ${fixedPrefix}.` };
  }

  if (!new RegExp(`^\\d{${sequenceDigits}}$`).test(suffix)) {
    return { ok: false as const, error: `A/C No. suffix must be ${sequenceDigits} digits.` };
  }

  const duplicate = await input.db.supplier.findFirst({
    where: {
      supplierAccountNo,
      ...(input.excludeSupplierId ? { NOT: { id: input.excludeSupplierId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    return { ok: false as const, error: "This supplier A/C No. is already used by another supplier." };
  }

  return { ok: true as const, supplierAccountNo };
}
