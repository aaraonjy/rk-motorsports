import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();

    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });

    const unreadCount = await db.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    return NextResponse.json({
      notifications: notifications.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
        orderId: item.order?.id ?? null,
        orderNumber: item.order?.orderNumber ?? null,
        href:
          user.role === "ADMIN"
            ? item.order?.orderNumber
              ? `/admin?search=${encodeURIComponent(item.order.orderNumber)}`
              : "/admin"
            : "/dashboard",
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json(
      { message: "Failed to load notifications." },
      { status: 500 }
    );
  }
}
