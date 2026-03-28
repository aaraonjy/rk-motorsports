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

  // Only allow owner (or admin)
  if (user.role !== "ADMIN" && order.userId !== user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // Only allow cancel if still early stage
  if (order.status !== "FILE_RECEIVED") {
    return NextResponse.json(
      { message: "Order cannot be cancelled" },
      { status: 400 }
    );
  }

  await db.order.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}