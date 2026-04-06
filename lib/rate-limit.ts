import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitCheckInput = {
  key: string;
  limit: number;
  windowMs: number;
  bypass?: boolean;
};

export type RateLimitCheckResult = {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  resetAt: number;
};

type MemoryEntry = {
  count: number;
  resetAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __rkRateLimitMemoryStore: Map<string, MemoryEntry> | undefined;
}

const memoryStore =
  globalThis.__rkRateLimitMemoryStore ||
  new Map<string, MemoryEntry>();

if (!globalThis.__rkRateLimitMemoryStore) {
  globalThis.__rkRateLimitMemoryStore = memoryStore;
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const upstashLimiterCache = new Map<string, Ratelimit>();

function getClientIpFromForwarded(forwarded: string | null) {
  if (!forwarded) return null;

  const firstSegment = forwarded.split(",")[0]?.trim();
  if (!firstSegment) return null;

  return firstSegment;
}

export function getClientIp(req: Request) {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const xRealIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");

  return (
    getClientIpFromForwarded(xForwardedFor) ||
    xRealIp ||
    cfConnectingIp ||
    "unknown"
  );
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function createRateLimitKey(...parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => encodeURIComponent(String(part).trim()))
    .join(":");
}

function getWindowSeconds(windowMs: number) {
  return Math.max(1, Math.ceil(windowMs / 1000));
}

function getUpstashDuration(windowMs: number) {
  const seconds = getWindowSeconds(windowMs);

  if (seconds % 86400 === 0) {
    return `${seconds / 86400} d`;
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600} h`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60} m`;
  }

  return `${seconds} s`;
}

function getUpstashLimiter(limit: number, windowMs: number) {
  const cacheKey = `${limit}:${windowMs}`;

  const cached = upstashLimiterCache.get(cacheKey);
  if (cached) return cached;

  if (!redis) return null;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, getUpstashDuration(windowMs)),
    prefix: "rk-rate-limit",
    analytics: true,
  });

  upstashLimiterCache.set(cacheKey, limiter);
  return limiter;
}

async function consumeWithMemoryStore(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitCheckResult> {
  const now = Date.now();
  const current = memoryStore.get(key);

  if (!current || current.resetAt <= now) {
    const next: MemoryEntry = {
      count: 1,
      resetAt: now + windowMs,
    };

    memoryStore.set(key, next);

    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - next.count),
      retryAfter: 0,
      resetAt: next.resetAt,
    };
  }

  current.count += 1;
  memoryStore.set(key, current);

  const success = current.count <= limit;
  const retryAfter = success
    ? 0
    : Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return {
    success,
    limit,
    remaining: Math.max(0, limit - current.count),
    retryAfter,
    resetAt: current.resetAt,
  };
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
  bypass = false,
}: RateLimitCheckInput): Promise<RateLimitCheckResult> {
  if (bypass) {
    return {
      success: true,
      limit,
      remaining: limit,
      retryAfter: 0,
      resetAt: Date.now() + windowMs,
    };
  }

  const limiter = getUpstashLimiter(limit, windowMs);

  if (!limiter) {
    return consumeWithMemoryStore(key, limit, windowMs);
  }

  const result = await limiter.limit(key);

  return {
    success: result.success,
    limit,
    remaining: result.remaining,
    retryAfter: result.success
      ? 0
      : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    resetAt: result.reset,
  };
}

export async function checkRateLimits(
  checks: Array<RateLimitCheckInput>
): Promise<RateLimitCheckResult> {
  let lastResult: RateLimitCheckResult = {
    success: true,
    limit: 0,
    remaining: 0,
    retryAfter: 0,
    resetAt: Date.now(),
  };

  for (const check of checks) {
    const result = await checkRateLimit(check);
    lastResult = result;

    if (!result.success) {
      return result;
    }
  }

  return lastResult;
}

export function buildRateLimitHeaders(result: RateLimitCheckResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    ...(result.retryAfter > 0
      ? {
          "Retry-After": String(result.retryAfter),
        }
      : {}),
  };
}
