import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";

function randomTempPassword() {
  return `rk-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizePhone(phone?: string | null) {
  const value = phone?.trim();
  return value ? value : null;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string | null;
    };

    const name = body.name?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const phone = normalizePhone(body.phone);

    if (!name) {
      return NextResponse.json({ ok: false, error: "Customer name is required." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required in the current system setup." }, { status: 400 });
    }

    const existingEmail = await db.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ ok: false, error: "This email is already in use." }, { status: 409 });
    }

    const passwordHash = await hashPassword(randomTempPassword());

    await db.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: "CUSTOMER",
        accountSource: "ADMIN",
        portalAccess: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json({ ok: false, error: "Unable to create customer right now." }, { status: 500 });
  }
}
