import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { validatePasswordComplexity } from "@/lib/password-validation";
import {
  buildRateLimitHeaders,
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/lib/rate-limit";

const RESET_PASSWORD_LIMIT = 5;
const RESET_PASSWORD_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const token = String(form.get("token") || "");
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    const rateLimitResult = await checkRateLimit({
      key: createRateLimitKey("reset-password", "ip", getClientIp(req)),
      limit: RESET_PASSWORD_LIMIT,
      windowMs: RESET_PASSWORD_WINDOW_MS,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many reset password attempts. Please try again later.",
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    if (!token || !password || !confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "All fields are required." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Password confirmation does not match." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const passwordError = validatePasswordComplexity(password);
    if (passwordError) {
      return NextResponse.json(
        { ok: false, error: passwordError },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const user = await db.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Reset token is invalid or has expired." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const hashed = await hashPassword(password);

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashed,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        redirectTo: "/login",
      },
      {
        headers: buildRateLimitHeaders(rateLimitResult),
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to reset password right now. Please try again." },
      { status: 500 }
    );
  }
}
