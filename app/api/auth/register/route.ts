import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");

  if (!name || !email || !password) return NextResponse.redirect(new URL("/register", req.url));

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return NextResponse.redirect(new URL("/login", req.url));

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
    },
  });

  await createSession(user.id);
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
