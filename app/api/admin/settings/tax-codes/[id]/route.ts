import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

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

export async function PATCH(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.taxCode.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Tax code not found." }, { status: 404 });
    }

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

    const duplicate = await db.taxCode.findFirst({
      where: {
        code,
        NOT: { id },
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json({ ok: false, error: `Tax code ${code} already exists.` }, { status: 409 });
    }

    if (!isActive) {
      const config = await db.taxConfiguration.findUnique({ where: { id: "default" } });
      if (config?.defaultPortalTaxCodeId === id || config?.defaultAdminTaxCodeId === id) {
        return NextResponse.json(
          { ok: false, error: "This tax code is currently selected as a default tax code. Please change the default selection first." },
          { status: 400 }
        );
      }
    }

    const updated = await db.taxCode.update({
      where: { id },
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
      action: "UPDATE_TAX_CODE",
      entityType: "TaxCode",
      entityId: updated.id,
      entityCode: updated.code,
      description: `${admin.name} updated tax code ${updated.code}.`,
      oldValues: {
        code: existing.code,
        description: existing.description,
        displayLabel: existing.displayLabel,
        rate: Number(existing.rate),
        calculationMethod: existing.calculationMethod,
        taxType: existing.taxType,
        isActive: existing.isActive,
        sortOrder: existing.sortOrder,
      },
      newValues: {
        code: updated.code,
        description: updated.description,
        displayLabel: updated.displayLabel,
        rate: Number(updated.rate),
        calculationMethod: updated.calculationMethod,
        taxType: updated.taxType,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/admin/settings/tax-codes/[id] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update tax code." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
