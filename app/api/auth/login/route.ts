import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildRateLimitHeaders,
  checkRateLimits,
  createRateLimitErrorPayload,
  createRateLimitKey,
  getClientIp,
  normalizeEmail,
} from "@/lib/rate-limit";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const rateLimitResult = await checkRateLimits([
      {
        key: createRateLimitKey("login", "ip", ip),
        limit: LOGIN_LIMIT,
        windowMs: LOGIN_WINDOW_MS,
      },
      {
        key: createRateLimitKey("login", "email", normalizeEmail(email)),
        limit: LOGIN_LIMIT,
        windowMs: LOGIN_WINDOW_MS,
      },
    ]);

    if (!rateLimitResult.success) {
      const retryAfterText = createRateLimitErrorPayload("", rateLimitResult).retryAfterText;
      return NextResponse.json(
        createRateLimitErrorPayload(
          `Too many failed login attempts. Please try again in ${retryAfterText}.`,
          rateLimitResult
        ),
        {
          status: 429,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        {
          status: 401,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        {
          status: 401,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    await createSession(user.id);

    return NextResponse.json(
      {
        ok: true,
        redirectTo: user.role === "ADMIN" ? "/admin" : "/dashboard",
      },
      {
        headers: buildRateLimitHeaders(rateLimitResult),
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to login right now. Please try again." },
      { status: 500 }
    );
  }
}
