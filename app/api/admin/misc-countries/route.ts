import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, 10) : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mapItem(item: any) {
  return { id: item.id, code: item.code, name: item.name, isActive: item.isActive };
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const pageSize = 10;
    const keyword = (url.searchParams.get("q") || "").trim();
    const where = keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: "insensitive" as const } },
            { name: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      db.country.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, code: true, name: true, isActive: true },
      }),
      db.country.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      items: items.map(mapItem),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load countries." },
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

    if (!code) return NextResponse.json({ ok: false, error: "Country code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Country name is required." }, { status: 400 });

    const duplicate = await db.country.findUnique({ where: { code } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Country code already exists." }, { status: 409 });

    const created = await db.country.create({ data: { code, name, isActive } });
    return NextResponse.json({ ok: true, item: mapItem(created) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create country." },
      { status: 500 }
    );
  }
}
