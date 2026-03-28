import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { get } from "@vercel/blob";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { id } = await ctx.params;
  const file = await db.orderFile.findUnique({
    where: { id },
    include: { order: true },
  });

  if (!file) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (user.role !== "ADMIN" && file.order.userId !== user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const blob = await get(file.storagePath);

  if (!blob.downloadUrl) {
    return NextResponse.json({ message: "Blob download unavailable" }, { status: 500 });
  }

  return NextResponse.redirect(blob.downloadUrl);
}