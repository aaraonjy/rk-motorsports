import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

const RETRYABLE_PRISMA_CODES = new Set([
  "P1001", // Cannot reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
]);

type DbRetryOptions = {
  attempts?: number;
  delayMs?: number;
  maxDelayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

export function isRetryableDatabaseError(error: unknown) {
  const code = getErrorCode(error);
  if (code && RETRYABLE_PRISMA_CODES.has(code)) return true;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("Can't reach database server") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("Connection terminated") ||
    message.includes("connection closed") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT")
  );
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: DbRetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const delayMs = Math.max(0, options.delayMs ?? 300);
  const maxDelayMs = Math.max(delayMs, options.maxDelayMs ?? 700);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !isRetryableDatabaseError(error)) {
        throw error;
      }

      const retryDelay = Math.min(delayMs * attempt, maxDelayMs);
      await sleep(retryDelay);
    }
  }

  throw lastError;
}
