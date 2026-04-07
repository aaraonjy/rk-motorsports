import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveFile, validateSinglePaymentUploadFile } from "@/lib/storage";
import {
  buildRateLimitHeaders,
  checkRateLimit,
  createRateLimitErrorPayload,
  createRateLimitKey,
} from "@/lib/rate-limit";

const PAYMENT_UPLOAD_LIMIT = 5;
const PAYMENT_UPLOAD_WINDOW_MS = 15 * 60 * 1000;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const { id } = await ctx.params;

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Please login before uploading your payment slip." },
        { status: 401 }
      );
    }

    const rateLimitResult = await checkRateLimit({
      key: createRateLimitKey("payment-upload", "user", user.id),
      limit: PAYMENT_UPLOAD_LIMIT,
      windowMs: PAYMENT_UPLOAD_WINDOW_MS,
      bypass: user.role === "ADMIN",
    });

    if (!rateLimitResult.success) {
      const retryAfterText = createRateLimitErrorPayload("", rateLimitResult).retryAfterText;
      return NextResponse.json(
        createRateLimitErrorPayload(
          `You have uploaded payment proof too many times. Please try again in ${retryAfterText}.`,
          rateLimitResult
        ),
        {
          status: 429,
          headers: buildRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "Please select a valid payment slip file." },
        { status: 400, headers: buildRateLimitHeaders(rateLimitResult) }
      );
    }

    const validationMessage = validateSinglePaymentUploadFile(file);
    if (validationMessage) {
      return NextResponse.json(
        { ok: false, error: validationMessage },
        { status: 400, headers: buildRateLimitHeaders(rateLimitResult) }
      );
    }

    const order = await db.order.findUnique({
      where: { id },
      include: { files: true },
    });

    const isAdminUploadingForAdminCreatedOrder =
      user.role === "ADMIN" && !!order?.createdByAdminId;

    if (
      !order ||
      (!isAdminUploadingForAdminCreatedOrder && order.userId !== user.id)
    ) {
      return NextResponse.json(
        { ok: false, error: "Order not found or access denied." },
        { status: 404, headers: buildRateLimitHeaders(rateLimitResult) }
      );
    }

    const existingPayment = order.files.find((f) => f.kind === "CUSTOMER_PAYMENT_PROOF");
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
      data: { status: "AWAITING_PAYMENT" },
    });

    if (user.role !== "ADMIN") {
      try {
        const admins = await db.user.findMany({ where: { role: "ADMIN" } });
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
    }

    const success = existingPayment ? "payment_replaced" : "payment_uploaded";

    return NextResponse.json(
      {
        ok: true,
        redirectTo:
          user.role === "ADMIN" ? "/admin" : `/dashboard?success=${success}`,
      },
      { headers: buildRateLimitHeaders(rateLimitResult) }
    );
  } catch (error) {
    console.error("Upload payment failed:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to upload payment slip right now. Please try again." },
      { status: 500 }
    );
  }
}
