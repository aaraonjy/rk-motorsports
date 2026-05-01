import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, 10) : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSymbol(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 8) : "";
}

function mapItem(item: any) {
  return { id: item.id, code: item.code, name: item.name, symbol: item.symbol, isActive: item.isActive };
}

export async function PATCH(req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const name = normalizeText(body.name);
    const symbol = normalizeSymbol(body.symbol);
    const isActive = Boolean(body.isActive);

    if (!code) return NextResponse.json({ ok: false, error: "Currency code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Currency name is required." }, { status: 400 });
    if (!symbol) return NextResponse.json({ ok: false, error: "Currency symbol is required." }, { status: 400 });

    const duplicate = await db.currency.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Currency code already exists." }, { status: 409 });

    const updated = await db.currency.update({ where: { id }, data: { code, name, symbol, isActive } });
    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update currency." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const currency = await db.currency.findUnique({ where: { id }, select: { code: true } });
    if (!currency) return NextResponse.json({ ok: false, error: "Currency not found." }, { status: 404 });

    const linkedCustomer = await db.user.findFirst({ where: { currency: currency.code }, select: { id: true } });
    if (linkedCustomer) {
      return NextResponse.json(
        { ok: false, error: "This currency is already used in customer profiles. Please set it inactive instead of deleting." },
        { status: 400 }
      );
    }

    await db.currency.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to delete currency." },
      { status: 500 }
    );
  }
}
