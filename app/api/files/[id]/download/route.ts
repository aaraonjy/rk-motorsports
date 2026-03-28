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
    return NextResponse.redirect(new URL("/login", req.url), 303);
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

  const result = await get(file.storagePath, {
    access: "private",
  });

  const contentType =
    file.mimeType ||
    result.headers.get("content-type") ||
    "application/octet-stream";

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}