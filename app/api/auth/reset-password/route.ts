import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();

  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");

  const user = await db.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
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

  return NextResponse.redirect(new URL("/login", req.url));
}