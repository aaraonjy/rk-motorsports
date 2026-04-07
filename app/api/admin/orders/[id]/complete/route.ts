import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

function needsEcu(tuningType: string | null | undefined) {
  return tuningType === "ECU" || tuningType === "ECU_TCU" || !tuningType;
}

function needsTcu(tuningType: string | null | undefined) {
  return tuningType === "TCU" || tuningType === "ECU_TCU";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await ctx.params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        files: true,
      },
    });

    if (!order) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const hasEcuReady =
      !needsEcu(order.tuningType) ||
      order.files.some((f) => f.kind === "ADMIN_ECU") ||
      order.files.some((f) => f.kind === "ADMIN_COMPLETED");

    const hasTcuReady =
      !needsTcu(order.tuningType) ||
      order.files.some((f) => f.kind === "ADMIN_TCU");

    if (!hasEcuReady || !hasTcuReady) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    if (order.createdByAdminId) {
      await db.order.update({
        where: { id },
        data: {
          status: "COMPLETED",
        },
      });

      return NextResponse.redirect(
        new URL("/admin?success=order_completed", req.url),
        303
      );
    }

    await db.order.update({
      where: { id },
      data: {
        status: "READY_FOR_DOWNLOAD",
      },
    });

    try {
      await db.notification.create({
        data: {
          userId: order.userId,
          type: "PAYMENT_CONFIRMED",
          title: "Payment received",
          message:
            order.tuningType === "ECU_TCU"
              ? "Payment received, your tuned ECU and TCU files are ready to download."
              : order.tuningType === "TCU"
                ? "Payment received, your tuned TCU file is ready to download."
                : "Payment received, your tuned ECU file is ready to download.",
          orderId: id,
        },
      });
    } catch (err) {
      console.error("Customer notification failed:", err);
    }

    return NextResponse.redirect(
      new URL("/admin?success=order_released", req.url),
      303
    );
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/complete failed:", error);
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }
}
