import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };
function normalizeCode(value: unknown) { return typeof value === "string" ? value.trim().toUpperCase() : ""; }
function normalizeText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function mapItem(item: any) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    isActive: item.isActive,
    groupId: item.projectId,
    groupLabel: item.project ? `${item.project.code} — ${item.project.name}` : null,
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
    const projectId = typeof body.groupId === "string" && body.groupId.trim() ? body.groupId.trim() : null;
    if (!code) return NextResponse.json({ ok: false, error: "Department code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Department name is required." }, { status: 400 });
    if (!projectId) return NextResponse.json({ ok: false, error: "Project is required." }, { status: 400 });
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, isActive: true } });
    if (!project || !project.isActive) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 400 });
    const duplicate = await db.department.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Department code already exists." }, { status: 409 });
    const updated = await db.department.update({ where: { id }, data: { code, name, isActive, projectId }, include: { project: { select: { code: true, name: true } } } });
    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update department." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const linked = await db.stockTransaction.findFirst({ where: { departmentId: id }, select: { id: true } });
    if (linked) {
      return NextResponse.json({ ok: false, error: "This department is already used in stock transactions. Please set it inactive instead of deleting." }, { status: 400 });
    }
    await db.department.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete department." }, { status: 500 });
  }
}
