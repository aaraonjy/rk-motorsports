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

function mapItem(item: any) {
  return { id: item.id, code: item.code, name: item.name, isActive: item.isActive };
}

export async function PATCH(req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const name = normalizeText(body.name);
    const isActive = Boolean(body.isActive);

    if (!code) return NextResponse.json({ ok: false, error: "Country code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Country name is required." }, { status: 400 });

    const duplicate = await db.country.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Country code already exists." }, { status: 409 });

    const updated = await db.country.update({ where: { id }, data: { code, name, isActive } });
    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update country." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const country = await db.country.findUnique({ where: { id }, select: { code: true } });
    if (!country) return NextResponse.json({ ok: false, error: "Country not found." }, { status: 404 });

    const [linkedUser, linkedAddress] = await Promise.all([
      db.user.findFirst({
        where: {
          OR: [{ billingCountryCode: country.code }, { deliveryCountryCode: country.code }],
        },
        select: { id: true },
      }),
      db.customerDeliveryAddress.findFirst({ where: { countryCode: country.code }, select: { id: true } }),
    ]);

    if (linkedUser || linkedAddress) {
      return NextResponse.json(
        { ok: false, error: "This country is already used in customer profiles. Please set it inactive instead of deleting." },
        { status: 400 }
      );
    }

    await db.country.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to delete country." },
      { status: 500 }
    );
  }
}
