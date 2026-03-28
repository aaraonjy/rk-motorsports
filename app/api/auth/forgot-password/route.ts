import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "node:crypto";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").toLowerCase();

  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

  await db.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpiry: expiry,
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  const resetLink = `${appUrl}/reset-password?token=${token}`;
  // TEMP: log instead of email
  console.log("RESET LINK:", resetLink);

  return NextResponse.redirect(
    new URL("/forgot-password?sent=1", req.url)
  );
}