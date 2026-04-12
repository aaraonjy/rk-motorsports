import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
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
      try {
        await createAuditLogFromRequest({
          req,
          module: "Authentication",
          action: "FAILED_LOGIN",
          entityType: "User",
          description: `Failed login attempt for ${email}.`,
          newValues: { email },
          status: "FAILED",
        });
      } catch (error) {
        console.error("Audit log creation failed:", error);
      }

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
      try {
        await createAuditLogFromRequest({
          req,
          user,
          module: "Authentication",
          action: "FAILED_LOGIN",
          entityType: "User",
          entityId: user.id,
          entityCode: user.email,
          description: `${user.name} failed to login.`,
          status: "FAILED",
        });
      } catch (error) {
        console.error("Audit log creation failed:", error);
      }

      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        {
          status: 401,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    await createSession(user.id);

    try {
      await createAuditLogFromRequest({
        req,
        user,
        module: "Authentication",
        action: "LOGIN",
        entityType: "User",
        entityId: user.id,
        entityCode: user.email,
        description: `${user.name} logged in successfully.`,
        status: "SUCCESS",
      });
    } catch (error) {
      console.error("Audit log creation failed:", error);
    }

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
