import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await ctx.params;

    const adminCompletedFile = await db.orderFile.findFirst({
      where: {
        orderId: id,
        kind: "ADMIN_COMPLETED",
      },
    });

    if (!adminCompletedFile) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const order = await db.order.findUnique({
      where: { id },
      select: { userId: true },
    });

    await db.order.update({
      where: { id },
      data: { status: "READY_FOR_DOWNLOAD" },
    });

    try {
      if (order) {
        await db.notification.create({
          data: {
            userId: order.userId,
            type: "PAYMENT_CONFIRMED",
            title: "Payment received",
            message: "Payment received, tuned file ready to download.",
            orderId: id,
          },
        });
      }
    } catch (err) {
      console.error("Customer notification failed:", err);
    }

    return NextResponse.redirect(new URL("/admin", req.url), 303);
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/complete failed:", error);
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }
}