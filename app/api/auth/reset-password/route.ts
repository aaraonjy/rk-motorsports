import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { validatePasswordComplexity } from "@/lib/password-validation";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const token = String(form.get("token") || "");
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (!token || !password || !confirmPassword) {
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
        { status: 400 }
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

    return NextResponse.json({
      ok: true,
      redirectTo: "/login",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to reset password right now. Please try again." },
      { status: 500 }
    );
  }
}
