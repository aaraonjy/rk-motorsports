import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createAuditLogFromRequest } from "@/lib/audit";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const formData = await req.formData();
  const cancelReasonRaw = formData.get("cancelReason");
  const cancelReason =
    typeof cancelReasonRaw === "string" && cancelReasonRaw.trim()
      ? cancelReasonRaw.trim()
      : null;

  const order = await db.order.findUnique({
    where: { id },
  });

  if (!order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  if (
    !["FILE_RECEIVED", "IN_PROGRESS", "AWAITING_PAYMENT"].includes(order.status)
  ) {
    return NextResponse.json(
      { message: "Order cannot be cancelled at this stage" },
      { status: 400 }
    );
  }

  await db.order.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledBy: "ADMIN",
      cancelReason,
      cancelledAt: new Date(),
    },
  });

  try {
    await createAuditLogFromRequest({
      req,
      user,
      module: "Orders",
      action: "CANCEL",
      entityType: "Order",
      entityId: order.id,
      entityCode: order.orderNumber,
      description: `${user.name} cancelled order ${order.orderNumber}.`,
      oldValues: {
        status: order.status,
        cancelReason: order.cancelReason,
      },
      newValues: {
        status: "CANCELLED",
        cancelledBy: "ADMIN",
        cancelReason,
      },
      status: "SUCCESS",
    });
  } catch (error) {
    console.error("Audit log creation failed:", error);
  }

  return NextResponse.redirect(
    new URL(`/admin?success=admin_order_cancelled&t=${Date.now()}`, req.url),
    303
  );
}
