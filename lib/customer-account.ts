import type { CustomerAccountNoFormat, PrismaClient } from "@prisma/client";

type CustomerAccountDb = PrismaClient;

export const DEFAULT_ACCOUNT_CONFIGURATION_ID = "default";
export const DEFAULT_CUSTOMER_ACCOUNT_PREFIX = "3000";
export const DEFAULT_CUSTOMER_ACCOUNT_FORMAT: CustomerAccountNoFormat = "XXXX_XXXX";

export const CUSTOMER_ACCOUNT_FORMAT_OPTIONS: Array<{
  value: CustomerAccountNoFormat;
  label: string;
  example: string;
  prefixLength: number;
  suffixLength: number;
}> = [
  {
    value: "XXXX_XXXX",
    label: "XXXX/XXXX",
    example: "3000/A001",
    prefixLength: 4,
    suffixLength: 4,
  },
  {
    value: "XXXX_XXXXX",
    label: "XXXX/XXXXX",
    example: "3000/A0001",
    prefixLength: 4,
    suffixLength: 5,
  },
  {
    value: "XXXX_XXX",
    label: "XXXX/XXX",
    example: "3000/A01",
    prefixLength: 4,
    suffixLength: 3,
  },
  {
    value: "XXX_XXXX",
    label: "XXX/XXXX",
    example: "300/A001",
    prefixLength: 3,
    suffixLength: 4,
  },
];

export function getCustomerAccountFormatOption(format: CustomerAccountNoFormat) {
  return (
    CUSTOMER_ACCOUNT_FORMAT_OPTIONS.find((option) => option.value === format) ||
    CUSTOMER_ACCOUNT_FORMAT_OPTIONS[0]
  );
}

export function normalizeCustomerAccountPrefix(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "")
    .toUpperCase();
}

export function normalizeCustomerAccountFormat(value: unknown): CustomerAccountNoFormat {
  const raw = String(value || "").trim();
  const matched = CUSTOMER_ACCOUNT_FORMAT_OPTIONS.find((option) => option.value === raw);
  return matched?.value || DEFAULT_CUSTOMER_ACCOUNT_FORMAT;
}

export function validateCustomerAccountConfiguration(input: {
  customerAccountPrefix: string;
  customerAccountNoFormat: CustomerAccountNoFormat;
}) {
  const prefix = normalizeCustomerAccountPrefix(input.customerAccountPrefix);
  const formatOption = getCustomerAccountFormatOption(input.customerAccountNoFormat);

  if (!prefix) {
    return "Customer A/C prefix is required.";
  }

  if (!/^[A-Z0-9]+$/.test(prefix)) {
    return "Customer A/C prefix can only contain letters and numbers.";
  }

  if (prefix.length !== formatOption.prefixLength) {
    return `Selected format requires a ${formatOption.prefixLength}-character prefix.`;
  }

  return null;
}

function getCustomerInitial(name: string) {
  const initial = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "X";
}

export async function getAccountConfiguration(db: CustomerAccountDb) {
  const config = await db.accountConfiguration.findUnique({
    where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
  });

  return {
    customerAccountPrefix:
      config?.customerAccountPrefix || DEFAULT_CUSTOMER_ACCOUNT_PREFIX,
    customerAccountNoFormat:
      config?.customerAccountNoFormat || DEFAULT_CUSTOMER_ACCOUNT_FORMAT,
  };
}

export async function generateNextCustomerAccountNo(db: CustomerAccountDb, customerName: string) {
  const config = await getAccountConfiguration(db);
  const prefix = normalizeCustomerAccountPrefix(config.customerAccountPrefix);
  const formatOption = getCustomerAccountFormatOption(config.customerAccountNoFormat);
  const initial = getCustomerInitial(customerName);
  const sequenceDigits = Math.max(1, formatOption.suffixLength - 1);
  const accountNoPrefix = `${prefix}/${initial}`;

  const latestCustomer = await db.user.findFirst({
    where: {
      role: "CUSTOMER",
      customerAccountNo: {
        startsWith: accountNoPrefix,
      },
    },
    select: {
      customerAccountNo: true,
    },
    orderBy: {
      customerAccountNo: "desc",
    },
  });

  const latestSequenceText = latestCustomer?.customerAccountNo?.slice(accountNoPrefix.length) || "";
  const latestSequence = Number(latestSequenceText);
  const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;

  return `${accountNoPrefix}${String(nextSequence).padStart(sequenceDigits, "0")}`;
}
