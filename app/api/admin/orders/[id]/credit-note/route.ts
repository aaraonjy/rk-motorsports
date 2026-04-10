import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCreditNoteNumber } from "@/lib/utils";

const ALLOWED_REASON_TYPES = [
  "CUSTOMER_CANCEL_ORDER",
  "PRICING_CORRECTION",
  "OVERCHARGE_ADJUSTMENT",
  "DUPLICATE_INVOICE",
  "SERVICE_NOT_PROCEEDED",
  "OTHER",
] as const;

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
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    if (reasonType === "OTHER" && !reasonRemarks) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
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
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    if (order.status !== "COMPLETED" || order.creditNote) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const amount = order.orderType === "CUSTOM_ORDER"
      ? Math.max(order.customGrandTotal || order.totalAmount || 0, 0)
      : Math.max(order.totalAmount || 0, 0);

    if (amount <= 0) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const items = order.orderType === "CUSTOM_ORDER" && order.customItems.length > 0
      ? order.customItems.map((item) => ({
          description: item.description,
          qty: item.qty,
          uom: item.uom || null,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        }))
      : [{
          description: buildStandardCreditNoteDescription(order),
          qty: 1,
          uom: null,
          unitPrice: amount,
          lineTotal: amount,
        }];

    await db.creditNote.create({
      data: {
        cnNo: generateCreditNoteNumber(),
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

    return NextResponse.redirect(new URL("/admin?success=credit_note_created", req.url), 303);
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/credit-note failed:", error);
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }
}
