
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

    if (!code) return NextResponse.json({ ok: false, error: "Product Group code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Product Group name is required." }, { status: 400 });

        const groupId = null;


    const duplicate = await db.productGroup.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Product Group code already exists." }, { status: 409 });

    const updated = await db.productGroup.update({
      where: { id },
      data: {
        code,
        name,
        isActive,

      },

    });

    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update product group." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const linked = await db.productSubGroup.findFirst({
      where: { groupId: id },
      select: { id: true },
    });
    if (linked) {
      return NextResponse.json({ ok: false, error: "This product group is already used in Product Master. Please set it inactive instead of deleting." }, { status: 400 });
    }

    await db.productGroup.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete product group." }, { status: 500 });
  }
}
