import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }

  const { id } = await ctx.params;

  const order = await db.order.findUnique({
    where: { id },
  });

  if (!order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  if (user.role !== "ADMIN" && order.userId !== user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!["FILE_RECEIVED", "IN_PROGRESS"].includes(order.status)) {
    return NextResponse.json(
      { message: "Order cannot be cancelled at this stage" },
      { status: 400 }
    );
  }

  await db.order.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledBy: "CUSTOMER",
      cancelReason: null,
      cancelledAt: new Date(),
    },
  });

  return NextResponse.redirect(
    new URL("/dashboard?success=order_cancelled", req.url),
    303
  );
}
