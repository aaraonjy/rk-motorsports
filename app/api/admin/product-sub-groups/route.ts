import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const PAGE_SIZE = 10;

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePage(value: string | null) {
  const parsed = Number(value || "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function mapItem(item: any) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    isActive: item.isActive,
    groupId: item.groupId,
    groupLabel: item.group ? `${item.group.code} — ${item.group.name}` : null,
  };
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const page = normalizePage(searchParams.get("page"));
    const q = searchParams.get("q")?.trim() || undefined;

    const where: Prisma.ProductSubGroupWhereInput = q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { group: { is: { code: { contains: q, mode: "insensitive" } } } },
            { group: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {};

    const [total, items] = await Promise.all([
      db.productSubGroup.count({ where }),
      db.productSubGroup.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { group: { select: { code: true, name: true } } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      items: items.map(mapItem),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load product sub-groups." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
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

    const duplicate = await db.productSubGroup.findUnique({ where: { code } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Product Sub-Group code already exists." }, { status: 409 });

    const created = await db.productSubGroup.create({
      data: {
        code,
        name,
        isActive,
        groupId,
      },
      include: { group: { select: { code: true, name: true } } },
    });

    return NextResponse.json({ ok: true, item: mapItem(created) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create product sub-group." }, { status: 500 });
  }
}
