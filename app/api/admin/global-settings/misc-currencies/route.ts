import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

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
            { symbol: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      db.currency.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, code: true, name: true, symbol: true, isActive: true },
      }),
      db.currency.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      items: items.map(mapItem),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load currencies." },
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
    const symbol = normalizeSymbol(body.symbol);
    const isActive = Boolean(body.isActive);

    if (!code) return NextResponse.json({ ok: false, error: "Currency code is required." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Currency name is required." }, { status: 400 });
    if (!symbol) return NextResponse.json({ ok: false, error: "Currency symbol is required." }, { status: 400 });

    const duplicate = await db.currency.findUnique({ where: { code } });
    if (duplicate) return NextResponse.json({ ok: false, error: "Currency code already exists." }, { status: 409 });

    const created = await db.currency.create({ data: { code, name, symbol, isActive } });
    return NextResponse.json({ ok: true, item: mapItem(created) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create currency." },
      { status: 500 }
    );
  }
}
