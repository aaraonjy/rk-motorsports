import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  saveFile,
  validatePackageUploadFiles,
  validateSingleUploadFile,
} from "@/lib/storage";

function needsEcu(tuningType: string | null | undefined) {
  return tuningType === "ECU" || tuningType === "ECU_TCU" || !tuningType;
}

function needsTcu(tuningType: string | null | undefined) {
  return tuningType === "TCU" || tuningType === "ECU_TCU";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await ctx.params;
    const form = await req.formData();

    const singleFile = form.get("file");
    const target = String(form.get("target") || "").trim().toUpperCase();

    const ecuFile = form.get("ecuFile");
    const tcuFile = form.get("tcuFile");

    const order = await db.order.findUnique({
      where: { id },
      include: {
        files: true,
      },
    });

    if (!order) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const uploads: Array<{ kind: string; file: File }> = [];

    if (singleFile instanceof File && singleFile.size > 0) {
      uploads.push({
        kind: target === "TCU" ? "ADMIN_TCU" : "ADMIN_ECU",
        file: singleFile,
      });
    }

    if (ecuFile instanceof File && ecuFile.size > 0) {
      uploads.push({
        kind: "ADMIN_ECU",
        file: ecuFile,
      });
    }

    if (tcuFile instanceof File && tcuFile.size > 0) {
      uploads.push({
        kind: "ADMIN_TCU",
        file: tcuFile,
      });
    }

    if (uploads.length === 0) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const validationMessage =
      uploads.length > 1
        ? validatePackageUploadFiles(uploads.map((upload) => upload.file))
        : validateSingleUploadFile(uploads[0].file);

    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    for (const upload of uploads) {
      const saved = await saveFile(
        upload.file,
        upload.kind === "ADMIN_TCU" ? "admin-tuned-tcu" : "admin-tuned-ecu"
      );

      const existing = await db.orderFile.findFirst({
        where: {
          orderId: id,
          kind: upload.kind,
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
            kind: upload.kind,
            fileName: saved.fileName,
            storagePath: saved.storagePath,
            mimeType: saved.mimeType,
          },
        });
      }
    }

    const refreshedFiles = await db.orderFile.findMany({
      where: { orderId: id },
    });

    const hasRequiredEcu =
      !needsEcu(order.tuningType) ||
      refreshedFiles.some((f) => f.kind === "ADMIN_ECU") ||
      refreshedFiles.some((f) => f.kind === "ADMIN_COMPLETED");

    const hasRequiredTcu =
      !needsTcu(order.tuningType) ||
      refreshedFiles.some((f) => f.kind === "ADMIN_TCU");

    const nextStatus =
      hasRequiredEcu && hasRequiredTcu ? "AWAITING_PAYMENT" : "IN_PROGRESS";

    await db.order.update({
      where: { id },
      data: {
        status: nextStatus,
      },
    });

    if (nextStatus === "AWAITING_PAYMENT") {
      try {
        await db.notification.create({
          data: {
            userId: order.userId,
            type: "TUNED_FILE_READY",
            title: "Tuned file ready",
            message:
              order.tuningType === "ECU_TCU"
                ? "Your tuned ECU and TCU files are ready, pending payment."
                : order.tuningType === "TCU"
                  ? "Your tuned TCU file is ready, pending payment."
                  : "Your tuned ECU file is ready, pending payment.",
            orderId: id,
          },
        });
      } catch (err) {
        console.error("Customer notification failed:", err);
      }
    }

    revalidatePath("/admin");
    revalidatePath("/dashboard");

    return NextResponse.redirect(new URL("/admin", req.url), 303);
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/upload failed:", error);
    return NextResponse.redirect(new URL("/admin", req.url), 303);
  }
}