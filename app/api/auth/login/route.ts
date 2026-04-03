import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
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

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    await createSession(user.id);

    return NextResponse.json({
      ok: true,
      redirectTo: user.role === "ADMIN" ? "/admin" : "/dashboard",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to login right now. Please try again." },
      { status: 500 }
    );
  }
}
