import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveFile, validateSingleUploadFile } from "@/lib/storage";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const { id } = await ctx.params;

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.redirect(new URL("/dashboard", req.url), 303);
    }

    const validationMessage = validateSingleUploadFile(file);

    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    const order = await db.order.findUnique({
      where: { id },
      include: { files: true },
    });

    if (!order || order.userId !== user.id) {
      return NextResponse.redirect(new URL("/dashboard", req.url), 303);
    }

    const existingPayment = order.files.find(
      (f) => f.kind === "CUSTOMER_PAYMENT_PROOF"
    );

    const saved = await saveFile(file, "customer-payment-proof");

    if (existingPayment) {
      await db.orderFile.update({
        where: { id: existingPayment.id },
        data: {
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      });
    } else {
      await db.orderFile.create({
        data: {
          orderId: order.id,
          kind: "CUSTOMER_PAYMENT_PROOF",
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      });
    }

    await db.order.update({
      where: { id: order.id },
      data: {
        status: "AWAITING_PAYMENT",
      },
    });

    try {
      const admins = await db.user.findMany({
        where: { role: "ADMIN" },
      });

      await db.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "PAYMENT_UPLOADED",
          title: "Payment slip uploaded",
          message: `${user.name} uploaded payment proof.`,
          orderId: order.id,
        })),
      });
    } catch (err) {
      console.error("Admin notification failed:", err);
    }

    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (error) {
    console.error("Upload payment failed:", error);
    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  }
}