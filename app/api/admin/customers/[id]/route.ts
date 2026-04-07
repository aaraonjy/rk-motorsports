import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

function normalizePhone(phone?: string | null) {
  const value = phone?.trim();
  return value ? value : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const body = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string | null;
    };

    const existingCustomer = await db.user.findUnique({ where: { id } });
    if (!existingCustomer) {
      return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });
    }

    const name = body.name?.trim() || "";
    const phone = normalizePhone(body.phone);
    const emailInput = body.email?.trim().toLowerCase() || "";

    if (!name) {
      return NextResponse.json({ ok: false, error: "Customer name is required." }, { status: 400 });
    }

    const nextEmail = existingCustomer.accountSource === "PORTAL"
      ? existingCustomer.email
      : emailInput;

    if (!nextEmail) {
      return NextResponse.json({ ok: false, error: "Email is required in the current system setup." }, { status: 400 });
    }

    const duplicateEmail = await db.user.findFirst({
      where: {
        email: nextEmail,
        NOT: { id },
      },
      select: { id: true },
    });

    if (duplicateEmail) {
      return NextResponse.json({ ok: false, error: "This email is already in use." }, { status: 409 });
    }

    await db.user.update({
      where: { id },
      data: {
        name,
        email: nextEmail,
        phone,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json({ ok: false, error: "Unable to update customer right now." }, { status: 500 });
  }
}
