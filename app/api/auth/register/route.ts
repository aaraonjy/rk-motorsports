import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { validatePasswordComplexity } from "@/lib/password-validation";
import { PHONE_COUNTRY_CODES } from "@/lib/phone-country-codes";
import {
  buildRateLimitHeaders,
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
} from "@/lib/rate-limit";

const REGISTER_LIMIT = 3;
const REGISTER_WINDOW_MS = 30 * 60 * 1000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FINAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const countryCode = String(form.get("countryCode") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    const rateLimitResult = await checkRateLimit({
      key: createRateLimitKey("register", "ip", getClientIp(req)),
      limit: REGISTER_LIMIT,
      windowMs: REGISTER_WINDOW_MS,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many registration attempts. Please try again later.",
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    if (!name || !email || !countryCode || !phone || !password || !confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "All fields are required." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const selectedCountry = PHONE_COUNTRY_CODES.find(
      (item) => item.code === countryCode
    );

    if (!selectedCountry) {
      return NextResponse.json(
        { ok: false, error: "Please select a valid country code." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const cleanedPhone = phone.replace(/[^\d]/g, "");
    const normalizedLocalPhone = cleanedPhone.startsWith("0")
      ? cleanedPhone.slice(1)
      : cleanedPhone;

    if (!normalizedLocalPhone) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid phone number." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    if (normalizedLocalPhone.length < 7 || normalizedLocalPhone.length > 12) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid phone number." },
        {
          status: 400,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const finalPhone = `${selectedCountry.dialCode}${normalizedLocalPhone}`;

    if (!FINAL_PHONE_REGEX.test(finalPhone)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid phone number." },
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

    const exists = await db.user.findUnique({ where: { email } });

    if (exists) {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists." },
        {
          status: 409,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        phone: finalPhone,
        passwordHash: await hashPassword(password),
      },
    });

    await createSession(user.id);

    return NextResponse.json(
      {
        ok: true,
        redirectTo: "/dashboard",
      },
      {
        headers: buildRateLimitHeaders(rateLimitResult),
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to create account right now. Please try again." },
      { status: 500 }
    );
  }
}
