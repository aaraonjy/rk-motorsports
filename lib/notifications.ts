import { NotificationType, Role } from "@prisma/client";
import { db } from "@/lib/db";

type CreateAdminNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  orderId?: string;
};

export async function createAdminNotification(
  input: CreateAdminNotificationInput
) {
  const admin = await db.user.findFirst({
    where: { role: Role.ADMIN },
    select: { id: true },
  });

  if (!admin) return null;

  return db.notification.create({
    data: {
      userId: admin.id,
      orderId: input.orderId,
      type: input.type,
      title: input.title,
      message: input.message,
    },
  });
}