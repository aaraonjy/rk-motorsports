import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.redirect(new URL("/login", req.url));

  await createSession(user.id);
  return NextResponse.redirect(
    new URL(user.role === "ADMIN" ? "/admin" : "/dashboard", req.url),
    303
  );
}
