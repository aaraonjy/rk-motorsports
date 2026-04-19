import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

type Params = { params: Promise<{ productId: string }> };

type NormalizedAssemblyTemplateLine = {
  lineNo: number;
  componentProductId: string;
  qty: number;
  uom: string;
  isRequired: boolean;
  allowOverride: boolean;
  remarks: string | null;
};

function normalizeUom(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeQty(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round((parsed + Number.EPSILON) * 10000) / 10000;
}

function mapTemplate(template: any) {
  return {
    id: template.id,
    finishedGoodProductId: template.finishedGoodProductId,
    remarks: template.remarks,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    lines: Array.isArray(template.lines)
      ? template.lines.map((line: any) => ({
          id: line.id,
          lineNo: line.lineNo,
          componentProductId: line.componentProductId,
          qty: Number(line.qty ?? 0),
          uom: line.uom,
          isRequired: line.isRequired,
          allowOverride: line.allowOverride,
          remarks: line.remarks,
        }))
      : [],
  };
}

export async function GET(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { productId } = await context.params;

    const template = await db.assemblyTemplate.findUnique({
      where: { finishedGoodProductId: productId },
      include: {
        lines: {
          orderBy: [{ lineNo: "asc" }],
        },
      },
    });

    return NextResponse.json({ ok: true, template: template ? mapTemplate(template) : null });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load assembly template." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

export async function PUT(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { productId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const remarks = typeof body.remarks === "string" ? body.remarks.trim() || null : null;
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    const product = await db.inventoryProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        code: true,
        description: true,
        itemType: true,
        trackInventory: true,
        isAssemblyItem: true,
      },
    });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Finished good product not found." }, { status: 404 });
    }

    if (product.itemType !== "STOCK_ITEM" || !product.trackInventory || !product.isAssemblyItem) {
      return NextResponse.json({ ok: false, error: "This product is not eligible for assembly template setup." }, { status: 400 });
    }

    if (rawLines.length === 0) {
      return NextResponse.json({ ok: false, error: "Please provide at least one assembly template line." }, { status: 400 });
    }

    const normalizedLines: NormalizedAssemblyTemplateLine[] = rawLines.map((line: any, index: number): NormalizedAssemblyTemplateLine => {
      const componentProductId = typeof line.componentProductId === "string" ? line.componentProductId.trim() : "";
      const qty = normalizeQty(line.qty);
      const uom = normalizeUom(line.uom);
      const lineRemarks = typeof line.remarks === "string" ? line.remarks.trim() || null : null;

      if (!componentProductId) {
        throw new Error(`Line ${index + 1}: component item is required.`);
      }
      if (componentProductId === productId) {
        throw new Error(`Line ${index + 1}: finished good cannot be used as its own component.`);
      }
      if (qty == null) {
        throw new Error(`Line ${index + 1}: qty must be greater than 0.`);
      }
      if (!uom) {
        throw new Error(`Line ${index + 1}: UOM is required.`);
      }

      return {
        lineNo: index + 1,
        componentProductId,
        qty,
        uom,
        isRequired: Boolean(line.isRequired),
        allowOverride: Boolean(line.allowOverride),
        remarks: lineRemarks,
      };
    });

    const componentIds = Array.from(new Set(normalizedLines.map((line) => line.componentProductId)));
    const components = await db.inventoryProduct.findMany({
      where: {
        id: { in: componentIds },
        isActive: true,
        itemType: "STOCK_ITEM",
        trackInventory: true,
      },
      select: { id: true, code: true, description: true, baseUom: true },
    });

    const componentMap = new Map(components.map((item) => [item.id, item]));
    for (const line of normalizedLines) {
      const component = componentMap.get(line.componentProductId);
      if (!component) {
        throw new Error(`Line ${line.lineNo}: selected component item is invalid, inactive, or not inventory tracked.`);
      }
    }

    const saved = await db.$transaction(async (tx) => {
      const template = await tx.assemblyTemplate.upsert({
        where: { finishedGoodProductId: productId },
        update: {
          remarks,
          isActive: true,
        },
        create: {
          finishedGoodProductId: productId,
          remarks,
          isActive: true,
        },
      });

      await tx.assemblyTemplateLine.deleteMany({
        where: { assemblyTemplateId: template.id },
      });

      if (normalizedLines.length > 0) {
        await tx.assemblyTemplateLine.createMany({
          data: normalizedLines.map((line) => ({
            assemblyTemplateId: template.id,
            lineNo: line.lineNo,
            componentProductId: line.componentProductId,
            qty: new Prisma.Decimal(line.qty.toFixed(4)),
            uom: line.uom,
            isRequired: line.isRequired,
            allowOverride: line.allowOverride,
            remarks: line.remarks,
          })),
        });
      }

      return tx.assemblyTemplate.findUniqueOrThrow({
        where: { id: template.id },
        include: {
          lines: {
            orderBy: [{ lineNo: "asc" }],
          },
        },
      });
    });

    await createAuditLogFromRequest({
      req,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      module: "STOCK_ASSEMBLY_TEMPLATE",
      action: "SAVE",
      entityType: "AssemblyTemplate",
      entityId: saved.id,
      entityCode: product.code,
      description: `Saved assembly template for ${product.code}.`,
      status: "SUCCESS",
      newValues: {
        finishedGoodProductId: productId,
        remarks,
        lineCount: normalizedLines.length,
      },
    });

    return NextResponse.json({ ok: true, template: mapTemplate(saved) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save assembly template." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
