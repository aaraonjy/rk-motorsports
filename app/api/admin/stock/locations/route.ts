import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

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

export async function GET() {
  try {
    await requireAdmin();

    const items = await db.stockLocation.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });

    return NextResponse.json({ ok: true, items: items.map(mapItem) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock locations." },
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

    if (!code) {
      return NextResponse.json({ ok: false, error: "Stock Location code is required." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "Stock Location name is required." }, { status: 400 });
    }

    const duplicate = await db.stockLocation.findUnique({ where: { code } });
    if (duplicate) {
      return NextResponse.json({ ok: false, error: "Stock Location code already exists." }, { status: 409 });
    }

    const created = await db.stockLocation.create({
      data: {
        code,
        name,
        isActive,
      },
    });

    return NextResponse.json({ ok: true, item: mapItem(created) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create stock location." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
