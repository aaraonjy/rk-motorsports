import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import { normalizeTaxCalculationMode } from "@/lib/tax";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));

    const taxModuleEnabled = Boolean(body.taxModuleEnabled);
    const taxCalculationMode = normalizeTaxCalculationMode(body.taxCalculationMode);
    const defaultPortalTaxCodeId =
      typeof body.defaultPortalTaxCodeId === "string" && body.defaultPortalTaxCodeId.trim()
        ? body.defaultPortalTaxCodeId.trim()
        : null;
    const defaultAdminTaxCodeId =
      typeof body.defaultAdminTaxCodeId === "string" && body.defaultAdminTaxCodeId.trim()
        ? body.defaultAdminTaxCodeId.trim()
        : null;

    const selectedIds = [defaultPortalTaxCodeId, defaultAdminTaxCodeId].filter(Boolean) as string[];
    const uniqueSelectedIds = [...new Set(selectedIds)];

    if (uniqueSelectedIds.length > 0) {
      const selectedCodes = await db.taxCode.findMany({
        where: {
          id: { in: uniqueSelectedIds },
        },
        select: {
          id: true,
          code: true,
          isActive: true,
        },
      });

      const invalidCode = selectedCodes.find((item) => !item.isActive);
      if (invalidCode) {
        return NextResponse.json(
          { ok: false, error: `Inactive tax code cannot be selected: ${invalidCode.code}.` },
          { status: 400 }
        );
      }

      if (selectedCodes.length !== uniqueSelectedIds.length) {
        return NextResponse.json(
          { ok: false, error: "One or more selected tax codes were not found." },
          { status: 400 }
        );
      }
    }

    const existing = await db.taxConfiguration.findUnique({ where: { id: "default" } });

    const saved = await db.taxConfiguration.upsert({
      where: { id: "default" },
      update: {
        taxModuleEnabled,
        taxCalculationMode,
        defaultPortalTaxCodeId,
        defaultAdminTaxCodeId,
      },
      create: {
        id: "default",
        taxModuleEnabled,
        taxCalculationMode,
        defaultPortalTaxCodeId,
        defaultAdminTaxCodeId,
      },
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Tax Configuration",
      action: existing ? "UPDATE" : "CREATE",
      entityType: "TaxConfiguration",
      entityId: saved.id,
      entityCode: "default",
      description: `${admin.name} ${existing ? "updated" : "created"} the tax configuration settings.`,
      oldValues: existing
        ? {
            taxModuleEnabled: existing.taxModuleEnabled,
            taxCalculationMode: existing.taxCalculationMode,
            defaultPortalTaxCodeId: existing.defaultPortalTaxCodeId,
            defaultAdminTaxCodeId: existing.defaultAdminTaxCodeId,
          }
        : null,
      newValues: {
        taxModuleEnabled: saved.taxModuleEnabled,
        taxCalculationMode: saved.taxCalculationMode,
        defaultPortalTaxCodeId: saved.defaultPortalTaxCodeId,
        defaultAdminTaxCodeId: saved.defaultAdminTaxCodeId,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/settings/tax-configuration failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save tax configuration." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
