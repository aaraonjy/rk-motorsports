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

export async function resolveLocationFromIp(ipAddress?: string | null) {
  if (!ipAddress || ipAddress === "127.0.0.1") {
    console.log("[audit] location skip: missing or localhost IP", { ipAddress });
    return null;
  }

  try {
    const url = `https://ipwho.is/${encodeURIComponent(ipAddress)}`;
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    console.log("[audit] ipwho.is response", {
      ipAddress,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      console.log("[audit] ipwho.is non-ok fallback", { ipAddress });
      return `IP: ${ipAddress}`;
    }

    const data = (await response.json()) as {
      success?: boolean;
      country?: string | null;
      region?: string | null;
      city?: string | null;
      message?: string | null;
    };

    console.log("[audit] ipwho.is payload", {
      ipAddress,
      success: data.success,
      city: data.city,
      region: data.region,
      country: data.country,
      message: data.message,
    });

    if (data.success === false) {
      console.log("[audit] ipwho.is success=false fallback", { ipAddress, data });
      return `IP: ${ipAddress}`;
    }

    const parts = [data.city, data.region, data.country].filter(Boolean);
    const location = parts.length > 0 ? parts.join(", ") : `IP: ${ipAddress}`;

    console.log("[audit] resolved location", { ipAddress, location });

    return location;
  } catch (error) {
    console.error("[audit] location lookup failed", { ipAddress, error });
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

type AuditLogFromRequestInput = Omit<AuditLogInput, "userId" | "userName" | "userEmail" | "userRole" | "ipAddress" | "location" | "userAgent"> & {
  req: Request | Headers;
  user?: AuditRequestUser | null;
};

export async function createAuditLogFromRequest(input: AuditLogFromRequestInput) {
  const headers = input.req instanceof Headers ? input.req : input.req.headers;
  const ipAddress = extractIpAddress(headers);
  const userAgent = extractUserAgent(headers);
  const location = await resolveLocationFromIp(ipAddress);

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
