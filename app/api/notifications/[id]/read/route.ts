import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const notification = await db.notification.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        isRead: true,
      },
    });

    if (!notification || notification.userId !== admin.id) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (!notification.isRead) {
      await db.notification.update({
        where: { id },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/notifications/[id]/read failed:", error);
    return NextResponse.json(
      { message: "Failed to mark notification as read." },
      { status: 500 }
    );
  }
}