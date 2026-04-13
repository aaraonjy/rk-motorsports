import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCreditNoteDocumentNumber } from "@/lib/document-number";
import { createAuditLogFromRequest } from "@/lib/audit";

type ApiResponse = {
  ok: boolean;
  error?: string;
  redirectTo?: string;
};

const ALLOWED_REASON_TYPES = [
  "CUSTOMER_CANCEL_ORDER",
  "PRICING_CORRECTION",
  "OVERCHARGE_ADJUSTMENT",
  "DUPLICATE_INVOICE",
  "SERVICE_NOT_PROCEEDED",
  "OTHER",
] as const;

function respondCreditNote(req: Request, payload: ApiResponse, status = 200) {
  const isClientSubmit = req.headers.get("x-rk-client-submit") === "1";

  if (isClientSubmit) {
    return NextResponse.json(payload, { status });
  }

  const redirectTo = payload.redirectTo || "/admin";
  return NextResponse.redirect(new URL(redirectTo, req.url), 303);
}

function buildStandardCreditNoteDescription(order: {
  selectedTuneLabel?: string | null;
  tuningType?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | null;
  orderNumber: string;
}) {
  const parts = [
    order.selectedTuneLabel || null,
    order.tuningType === "ECU_TCU" ? "ECU + TCU Tuning" : order.tuningType === "TCU" ? "TCU Tuning" : "ECU Tuning",
    [order.vehicleBrand, order.vehicleModel, order.vehicleYear].filter(Boolean).join(" ") || null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : `Credit Note for Order ${order.orderNumber}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const form = await req.formData();

    const reasonType = String(form.get("reasonType") || "").trim().toUpperCase();
    const reasonRemarksRaw = form.get("reasonRemarks");
    const reasonRemarks = typeof reasonRemarksRaw === "string" && reasonRemarksRaw.trim() ? reasonRemarksRaw.trim() : null;

    if (!ALLOWED_REASON_TYPES.includes(reasonType as (typeof ALLOWED_REASON_TYPES)[number])) {
      return respondCreditNote(req, { ok: false, redirectTo: "/admin" }, 400);
    }

    if (reasonType === "OTHER" && !reasonRemarks) {
      return respondCreditNote(req, { ok: false, redirectTo: "/admin" }, 400);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: {
        customItems: { orderBy: { createdAt: "asc" } },
        creditNote: true,
        user: true,
      },
    });

    if (!order) {
      return respondCreditNote(req, { ok: false, redirectTo: "/admin" }, 400);
    }

    if (order.status !== "COMPLETED" || order.creditNote) {
      return respondCreditNote(req, { ok: false, redirectTo: "/admin" }, 400);
    }

    const amount = Number(order.orderType === "CUSTOM_ORDER"
      ? order.customGrandTotal || order.totalAmount || 0
      : order.totalAmount || 0);

    if (amount <= 0) {
      return respondCreditNote(req, { ok: false, redirectTo: "/admin" }, 400);
    }

    const subtotalBeforeTax = Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0);

    const items = order.orderType === "CUSTOM_ORDER" && order.customItems.length > 0
      ? order.customItems.map((item) => ({
          description: item.description,
          qty: item.qty,
          uom: item.uom || null,
          unitPrice: Number(item.unitPrice || 0),
          lineTotal: Number(item.lineTotal || 0),
        }))
      : [{
          description: buildStandardCreditNoteDescription(order),
          qty: 1,
          uom: null,
          unitPrice: subtotalBeforeTax,
          lineTotal: subtotalBeforeTax,
        }];

    const cnDate = new Date();
    const cnNo = await generateCreditNoteDocumentNumber(cnDate);

    const creditNote = await db.creditNote.create({
      data: {
        cnNo,
        cnDate,
        orderId: order.id,
        customerId: order.userId,
        referenceOrderNumber: order.orderNumber,
        reasonType,
        reasonRemarks,
        amount,
        createdByAdminId: admin.id,
        items: {
          create: items,
        },
      },
    });

    try {
      await createAuditLogFromRequest({
        req,
        user: admin,
        module: "Credit Notes",
        action: "CREATE",
        entityType: "CreditNote",
        entityId: creditNote.id,
        entityCode: creditNote.cnNo,
        description: `${admin.name} created credit note ${creditNote.cnNo} for order ${order.orderNumber}.`,
        newValues: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.user.id,
          customerName: order.user.name,
          reasonType,
          reasonRemarks,
          amount,
          itemCount: items.length,
        },
        status: "SUCCESS",
      });
    } catch (error) {
      console.error("Audit log creation failed:", error);
    }

    return respondCreditNote(req, { ok: true, redirectTo: "/admin?success=credit_note_created" });
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/credit-note failed:", error);
    return respondCreditNote(req, { ok: false, redirectTo: "/login", error: "Unable to create Credit Note right now." }, 500);
  }
}
