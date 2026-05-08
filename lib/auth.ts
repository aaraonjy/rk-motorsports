import crypto from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db, withDbRetry } from "@/lib/db";

const COOKIE_NAME = "rk_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

type SessionRole = "ADMIN" | "CUSTOMER";

type SessionUser = {
  id: string;
  role: SessionRole;
  name: string;
  email: string;
};

type SessionPayload = SessionUser & {
  version: 2;
  issuedAt: number;
};

function secret() {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SessionPayload>;

    if (parsed.version !== 2) return null;
    if (typeof parsed.id !== "string" || !parsed.id) return null;
    if (parsed.role !== "ADMIN" && parsed.role !== "CUSTOMER") return null;
    if (typeof parsed.name !== "string") return null;
    if (typeof parsed.email !== "string" || !parsed.email) return null;
    if (typeof parsed.issuedAt !== "number" || !Number.isFinite(parsed.issuedAt)) return null;
    if (Date.now() - parsed.issuedAt > SESSION_MAX_AGE_MS) return null;

    return {
      version: 2,
      id: parsed.id,
      role: parsed.role,
      name: parsed.name,
      email: parsed.email,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
}

function normalizeSessionUser(user: SessionUser) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  };
}

export async function createSession(user: SessionUser | string) {
  let payload: string;

  if (typeof user === "string") {
    // Backward-compatible fallback for any older caller that still passes only a user ID.
    // New login code passes the full safe session user object to avoid DB lookups on every page load.
    payload = `${user}.${Date.now()}`;
  } else {
    payload = encodePayload({
      version: 2,
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      issuedAt: Date.now(),
    });
  }

  const token = `${payload}.${sign(payload)}`;
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const parts = token.split(".");

  // New lightweight signed-cookie session format:
  // base64url(JSON payload).signature
  if (parts.length === 2) {
    const [payload, signature] = parts;
    if (!payload || !signature || sign(payload) !== signature) return null;

    const decoded = decodePayload(payload);
    if (!decoded) return null;

    return normalizeSessionUser(decoded);
  }

  // Legacy session fallback:
  // userId.timestamp.signature
  // This keeps existing logged-in users working until they log in again.
  if (parts.length >= 3) {
    const payload = `${parts[0]}.${parts[1]}`;
    if (sign(payload) !== parts[2]) return null;

    const user = await withDbRetry(
      () =>
        db.user.findUnique({
          where: { id: parts[0] },
          select: {
            id: true,
            role: true,
            name: true,
            email: true,
          },
        }),
      { attempts: 2, delayMs: 250, maxDelayMs: 600 }
    );

    if (!user || (user.role !== "ADMIN" && user.role !== "CUSTOMER")) return null;
    return normalizeSessionUser(user);
  }

  return null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function verifyPassword(input: string, hash: string) {
  return bcrypt.compare(input, hash);
}

export async function hashPassword(input: string) {
  return bcrypt.hash(input, 10);
}
