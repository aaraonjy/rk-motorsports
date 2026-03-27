import crypto from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const COOKIE_NAME = "rk_session";

function secret() {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createSession(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  const token = `${payload}.${sign(payload)}`;
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length < 3) return null;

  const payload = `${parts[0]}.${parts[1]}`;
  if (sign(payload) !== parts[2]) return null;

  const user = await db.user.findUnique({ where: { id: parts[0] } });
  if (!user) return null;
  return user;
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
