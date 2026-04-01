import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { saveFile } from "@/lib/storage";
import { createAdminNotification } from "@/lib/notifications";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const { id } = await ctx.params;

    const order = await db.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
      },
    });

    if (!order || order.userId !== user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.redirect(new URL("/dashboard", req.url), 303);
    }

    const saved = await saveFile(file, "payment-proof");

    const existing = await db.orderFile.findFirst({
      where: {
        orderId: id,
        kind: "CUSTOMER_PAYMENT_PROOF",
      },
    });

    if (existing) {
      await db.orderFile.update({
        where: { id: existing.id },
        data: {
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      });
    } else {
      await db.orderFile.create({
        data: {
          orderId: id,
          kind: "CUSTOMER_PAYMENT_PROOF",
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      });
    }

    try {
      await createAdminNotification({
        type: "PAYMENT_UPLOADED",
        title: "Payment proof uploaded",
        message: `${user.name} uploaded payment proof for ${order.orderNumber}.`,
        orderId: id,
      });
    } catch (error) {
      console.error("Notification creation failed:", error);
    }

    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (error) {
    console.error("POST /api/orders/[id]/upload-payment failed:", error);
    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  }
}