import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "node:crypto";
import {
  buildRateLimitHeaders,
  checkRateLimits,
  createRateLimitErrorPayload,
  createRateLimitKey,
  getClientIp,
  normalizeEmail,
} from "@/lib/rate-limit";

const FORGOT_PASSWORD_LIMIT = 3;
const FORGOT_PASSWORD_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const email = normalizeEmail(String(form.get("email") || ""));

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Email is required." },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const rateLimitResult = await checkRateLimits([
      {
        key: createRateLimitKey("forgot-password", "ip", ip),
        limit: FORGOT_PASSWORD_LIMIT,
        windowMs: FORGOT_PASSWORD_WINDOW_MS,
      },
      {
        key: createRateLimitKey("forgot-password", "email", email),
        limit: FORGOT_PASSWORD_LIMIT,
        windowMs: FORGOT_PASSWORD_WINDOW_MS,
      },
    ]);

    if (!rateLimitResult.success) {
      const retryAfterText = createRateLimitErrorPayload("", rateLimitResult).retryAfterText;
      return NextResponse.json(
        createRateLimitErrorPayload(
          `Too many password reset requests. Please try again in ${retryAfterText}.`,
          rateLimitResult
        ),
        {
          status: 429,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const user = await db.user.findUnique({ where: { email } });

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 1000 * 60 * 30);

      await db.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetTokenExpiry: expiry,
        },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      const resetLink = `${appUrl}/reset-password?token=${token}`;
      console.log("RESET LINK:", resetLink);
    }

    return NextResponse.json(
      {
        ok: true,
        message: "If the email exists, a reset link has been sent.",
      },
      {
        headers: buildRateLimitHeaders(rateLimitResult),
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to process your request right now. Please try again." },
      { status: 500 }
    );
  }
}
