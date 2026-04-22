import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

function normalizeCode(value: unknown) { return typeof value === "string" ? value.trim().toUpperCase() : ""; }
function normalizeText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function mapItem(item: any) { return { id: item.id, code: item.code, name: item.name, isActive: item.isActive }; }

export async function PATCH(req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const name = normalizeText(body.name);
    const isActive = Boolean(body.isActive);
    if (!code) return NextResponse.json({ ok: false, error: "Project code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Project name is required." }, { status: 400 });
    const duplicate = await db.project.findFirst({ where: { code, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Project code already exists." }, { status: 409 });
    const updated = await db.project.update({ where: { id }, data: { code, name, isActive } });
    return NextResponse.json({ ok: true, item: mapItem(updated) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update project." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const linkedDepartment = await db.department.findFirst({ where: { projectId: id }, select: { id: true } });
    if (linkedDepartment) {
      return NextResponse.json({ ok: false, error: "This project is already used by Department Maintenance. Please set it inactive instead of deleting." }, { status: 400 });
    }
    const linkedTransaction = await db.stockTransaction.findFirst({ where: { projectId: id }, select: { id: true } });
    if (linkedTransaction) {
      return NextResponse.json({ ok: false, error: "This project is already used in stock transactions. Please set it inactive instead of deleting." }, { status: 400 });
    }
    await db.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to delete project." }, { status: 500 });
  }
}
