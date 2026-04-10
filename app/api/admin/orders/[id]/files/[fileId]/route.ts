import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { get } from "@vercel/blob";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const { id, fileId } = await ctx.params;

    const file = await db.orderFile.findFirst({
      where: {
        id: fileId,
        orderId: id,
      },
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
      result.contentType ||
      "application/octet-stream";

    return new NextResponse(result.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/orders/[id]/files/[fileId] failed:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
