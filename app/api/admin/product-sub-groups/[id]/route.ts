
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
    groupId: item.groupId, groupLabel: item.group ? `${item.group.code} — ${item.group.name}` : null,
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

    if (!code) return NextResponse.json({ ok: false, error: "Product Sub-Group code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Product Sub-Group name is required." }, { status: 400 });


const groupId = typeof body.groupId === "string" && body.groupId.trim() ? body.groupId.trim() : null;
if (!groupId) {
  return NextResponse.json({ ok: false, error: "Product Group is required." }, { status: 400 });
}
const existingGroup = await db.productGroup.findUnique({ where: { id: groupId }, select: { id: true, isActive: true } });
if (!existingGroup || !existingGroup.isActive) {
  return NextResponse.json({ ok: false, error: "Product Group not found." }, { status: 400 });
}


    const duplicate = await db.productSubGroup.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Product Sub-Group code already exists." }, { status: 409 });

    const updated = await db.productSubGroup.update({
      where: { id },
      data: {
        code,
        name,
        isActive,
        groupId,
      },
      include: { group: { select: { code: true, name: true } } },
    });

    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update product sub-group." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const linked = await db.inventoryProduct.findFirst({
      where: { subGroupId: id },
      select: { id: true },
    });
    if (linked) {
      return NextResponse.json({ ok: false, error: "This product sub-group is already used in Product Master. Please set it inactive instead of deleting." }, { status: 400 });
    }

    await db.productSubGroup.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete product sub-group." }, { status: 500 });
  }
}
