import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mapItem(item: any) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    isActive: item.isActive,
    createdAt: item.createdAt?.toISOString?.() ?? null,
    updatedAt: item.updatedAt?.toISOString?.() ?? null,
  };
}

export async function PATCH(req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const name = normalizeText(body.name);
    const isActive = Boolean(body.isActive);

    if (!code) {
      return NextResponse.json({ ok: false, error: "Stock Location code is required." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "Stock Location name is required." }, { status: 400 });
    }

    const duplicate = await db.stockLocation.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) {
      return NextResponse.json({ ok: false, error: "Stock Location code already exists." }, { status: 409 });
    }

    const updated = await db.stockLocation.update({
      where: { id },
      data: {
        code,
        name,
        isActive,
      },
    });

    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update stock location." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const [usedInConfig, usedInProduct, usedInLine, usedInLedger] = await Promise.all([
      db.stockConfiguration.findFirst({ where: { defaultLocationId: id }, select: { id: true } }),
      db.inventoryProduct.findFirst({ where: { defaultLocationId: id }, select: { id: true } }),
      db.stockTransactionLine.findFirst({
        where: {
          OR: [{ locationId: id }, { fromLocationId: id }, { toLocationId: id }],
        },
        select: { id: true },
      }),
      db.stockLedger.findFirst({ where: { locationId: id }, select: { id: true } }),
    ]);

    if (usedInConfig || usedInProduct || usedInLine || usedInLedger) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This stock location is already used in Stock Settings, Product Master, or stock transactions. Please set it inactive instead of deleting.",
        },
        { status: 400 }
      );
    }

    await db.stockLocation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to delete stock location." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
