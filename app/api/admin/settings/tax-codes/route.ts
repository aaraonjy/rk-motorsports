import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRate(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizeCalculationMethod(value: unknown) {
  return value === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
}

function normalizeTaxType(value: unknown) {
  return value === "SALES" ? "SALES" : "SERVICE";
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const code = normalizeCode(body.code);
    const description = normalizeText(body.description);
    const displayLabel = normalizeText(body.displayLabel);
    const rate = normalizeRate(body.rate);
    const calculationMethod = normalizeCalculationMethod(body.calculationMethod);
    const taxType = normalizeTaxType(body.taxType);
    const isActive = Boolean(body.isActive);
    const sortOrder = Math.max(0, Number(body.sortOrder || 0) || 0);

    if (!code) {
      return NextResponse.json({ ok: false, error: "Tax code is required." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: "Tax description is required." }, { status: 400 });
    }

    if (rate == null) {
      return NextResponse.json({ ok: false, error: "Tax rate must be between 0 and 100." }, { status: 400 });
    }

    const existing = await db.taxCode.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ ok: false, error: `Tax code ${code} already exists.` }, { status: 409 });
    }

    const created = await db.taxCode.create({
      data: {
        code,
        description,
        displayLabel: displayLabel || null,
        rate: new Prisma.Decimal(rate.toFixed(2)),
        calculationMethod,
        taxType,
        isActive,
        sortOrder,
      },
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Tax Configuration",
      action: "CREATE_TAX_CODE",
      entityType: "TaxCode",
      entityId: created.id,
      entityCode: created.code,
      description: `${admin.name} created tax code ${created.code}.`,
      newValues: {
        code: created.code,
        description: created.description,
        displayLabel: created.displayLabel,
        rate: Number(created.rate),
        calculationMethod: created.calculationMethod,
        taxType: created.taxType,
        isActive: created.isActive,
        sortOrder: created.sortOrder,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error("POST /api/admin/settings/tax-codes failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create tax code." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
