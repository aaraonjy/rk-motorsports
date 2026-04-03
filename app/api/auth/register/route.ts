import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { validatePasswordComplexity } from "@/lib/password-validation";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (!name || !email || !password || !confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Password confirmation does not match." },
        { status: 400 }
      );
    }

    const passwordError = validatePasswordComplexity(password);
    if (passwordError) {
      return NextResponse.json(
        { ok: false, error: passwordError },
        { status: 400 }
      );
    }

    const exists = await db.user.findUnique({ where: { email } });

    if (exists) {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
      },
    });

    await createSession(user.id);

    return NextResponse.json({
      ok: true,
      redirectTo: "/dashboard",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to create account right now. Please try again." },
      { status: 500 }
    );
  }
}
