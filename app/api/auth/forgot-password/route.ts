import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "node:crypto";
import {
  checkRateLimits,
  createRateLimitKey,
  getClientIp,
  normalizeEmail,
} from "@/lib/rate-limit";

const FORGOT_PASSWORD_LIMIT = 3;
const FORGOT_PASSWORD_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();

  const ip = getClientIp(req);
  const checks = [
    {
      key: createRateLimitKey("forgot-password", "ip", ip),
      limit: FORGOT_PASSWORD_LIMIT,
      windowMs: FORGOT_PASSWORD_WINDOW_MS,
    },
  ];

  if (email) {
    checks.push({
      key: createRateLimitKey("forgot-password", "email", normalizeEmail(email)),
      limit: FORGOT_PASSWORD_LIMIT,
      windowMs: FORGOT_PASSWORD_WINDOW_MS,
    });
  }

  const rateLimitResult = await checkRateLimits(checks);

  if (!rateLimitResult.success) {
    return NextResponse.redirect(
      new URL("/forgot-password?error=too_many_requests", req.url),
      303
    );
  }

  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

  await db.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpiry: expiry,
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  const resetLink = `${appUrl}/reset-password?token=${token}`;
  // TEMP: log instead of email
  console.log("RESET LINK:", resetLink);

  return NextResponse.redirect(
    new URL("/forgot-password?sent=1", req.url),
    303
  );
}
