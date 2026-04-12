import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculatePaymentSummary } from "@/lib/payment-summary";

type AddPaymentPayload = {
  paymentDate?: string;
  paymentMode?: string;
  amount?: number | string;
};

function sanitizeMoneyAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function isAllowedPaymentMode(value: string) {
  return ["CASH", "CARD", "BANK_TRANSFER", "QR"].includes(value);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "You must be logged in." },
        { status: 401 }
      );
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Only admin can add payments." },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;
    const body = (await req.json()) as AddPaymentPayload;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        payments: {
          orderBy: { paymentDate: "asc" },
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMode: true,
          },
        },
      },
    });

    if (!order || order.orderType !== "CUSTOM_ORDER") {
      return NextResponse.json(
        { ok: false, error: "Custom order not found." },
        { status: 404 }
      );
    }

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: "Completed or cancelled custom orders cannot accept new payments." },
        { status: 400 }
      );
    }

    const paymentMode = String(body.paymentMode || "").trim().toUpperCase();
    const amount = sanitizeMoneyAmount(body.amount);
    const grandTotal = Number(order.customGrandTotal ?? order.totalAmount ?? 0);
    const currentOutstandingBalance = Math.max(
      grandTotal - Number(order.totalPaid ?? 0),
      0
    );

    if (!isAllowedPaymentMode(paymentMode)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payment mode." },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Payment amount must be greater than RM0." },
        { status: 400 }
      );
    }

    if (amount > currentOutstandingBalance) {
      return NextResponse.json(
        { ok: false, error: "Payment amount cannot exceed the outstanding balance." },
        { status: 400 }
      );
    }

    const paymentDateRaw = String(body.paymentDate || "").trim();
    const paymentDate = paymentDateRaw ? new Date(paymentDateRaw) : new Date();

    if (Number.isNaN(paymentDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Invalid payment date." },
        { status: 400 }
      );
    }

    paymentDate.setHours(0, 0, 0, 0);

    const allPayments = [
      ...order.payments.map((payment) => ({ amount: Number(payment.amount || 0) })),
      { amount },
    ];
    const summary = calculatePaymentSummary(allPayments, grandTotal);

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId: order.id,
          paymentDate,
          paymentMode,
          amount,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          totalPaid: Number(summary.totalPaid || 0),
          outstandingBalance: Number(summary.outstandingBalance || 0),
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/payments failed:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to add payment right now." },
      { status: 500 }
    );
  }
}
