import { db } from "@/lib/db";

type AuditLogStatus = "SUCCESS" | "FAILED";

type AuditLogInput = {
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  entityCode?: string | null;
  description: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  location?: string | null;
  userAgent?: string | null;
  status?: AuditLogStatus;
  requestId?: string | null;
};

function normalizeIpAddress(value?: string | null) {
  if (!value) return null;

  const firstValue = value
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);

  if (!firstValue) return null;

  if (firstValue === "::1") return "127.0.0.1";

  return firstValue;
}

export function extractIpAddress(headers: Headers) {
  return normalizeIpAddress(
    headers.get("x-forwarded-for") || headers.get("x-real-ip") || headers.get("cf-connecting-ip"),
  );
}

export function extractUserAgent(headers: Headers) {
  return headers.get("user-agent") || null;
}

function resolveLocationFromHeaders(headers: Headers) {
  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("x-country-code") ||
    headers.get("cf-ipcountry") ||
    null;

  const region =
    headers.get("x-vercel-ip-country-region") ||
    headers.get("x-region") ||
    headers.get("x-appengine-region") ||
    null;

  const city =
    headers.get("x-vercel-ip-city") ||
    headers.get("x-city") ||
    null;

  const parts = [city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export async function resolveLocationFromIp(ipAddress?: string | null) {
  if (!ipAddress || ipAddress === "127.0.0.1") return null;

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ipAddress)}/json/`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return `IP: ${ipAddress}`;
    }

    const data = await response.json();

    const parts = [data.region, data.country_name].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : `IP: ${ipAddress}`;
  } catch {
    return `IP: ${ipAddress}`;
  }
}

export async function createAuditLog(input: AuditLogInput) {
  return db.auditLog.create({
    data: {
      userId: input.userId || null,
      userName: input.userName || null,
      userEmail: input.userEmail || null,
      userRole: input.userRole || null,
      module: input.module,
      action: input.action,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      entityCode: input.entityCode || null,
      description: input.description,
      oldValues: input.oldValues == null ? undefined : input.oldValues,
      newValues: input.newValues == null ? undefined : input.newValues,
      ipAddress: input.ipAddress || null,
      location: input.location || null,
      userAgent: input.userAgent || null,
      status: input.status || "SUCCESS",
      requestId: input.requestId || null,
    },
  });
}

type AuditRequestUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type AuditLogFromRequestInput = Omit<
  AuditLogInput,
  "userId" | "userName" | "userEmail" | "userRole" | "ipAddress" | "location" | "userAgent"
> & {
  req: Request | Headers;
  user?: AuditRequestUser | null;
};

export async function createAuditLogFromRequest(input: AuditLogFromRequestInput) {
  const headers = input.req instanceof Headers ? input.req : input.req.headers;
  const ipAddress = extractIpAddress(headers);
  const userAgent = extractUserAgent(headers);

  const headerLocation = resolveLocationFromHeaders(headers);
  const location = headerLocation || (await resolveLocationFromIp(ipAddress));

  return createAuditLog({
    ...input,
    userId: input.user?.id ?? null,
    userName: input.user?.name ?? null,
    userEmail: input.user?.email ?? null,
    userRole: input.user?.role ?? null,
    ipAddress,
    location,
    userAgent,
  });
}
