import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

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


export async function GET() {
  try {
    await requireAdmin();
    const items = await db.department.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      include: { project: { select: { code: true, name: true } } },
    });
    return NextResponse.json({ ok: true, items: items.map(mapItem) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load departments." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
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
    const duplicate = await db.department.findUnique({ where: { code } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Department code already exists." }, { status: 409 });
    const created = await db.department.create({ data: { code, name, isActive, projectId }, include: { project: { select: { code: true, name: true } } } });
    return NextResponse.json({ ok: true, item: mapItem(created) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create department." }, { status: 500 });
  }
}
