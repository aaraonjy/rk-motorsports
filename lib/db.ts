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

function isRetryableDatabaseError(error: unknown) {
  const maybeError = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };

  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const causeCode = typeof maybeError.cause?.code === "string" ? maybeError.cause.code : "";
  const message = [maybeError.message, maybeError.cause?.message]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    causeCode === "ECONNRESET" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "ECONNREFUSED" ||
    message.includes("can't reach database server") ||
    message.includes("connect timeout") ||
    message.includes("connection terminated") ||
    message.includes("connection closed") ||
    message.includes("connection refused") ||
    message.includes("timed out")
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !isRetryableDatabaseError(error)) {
        throw error;
      }

      const backoffMs = 500 * Math.pow(2, attempt);
      await delay(backoffMs);

      try {
        await db.$connect();
      } catch {
        // Ignore reconnect failure here so the next retry can surface the real Prisma error if it still fails.
      }
    }
  }

  throw lastError;
}
