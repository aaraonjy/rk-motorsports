import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await ctx.params;
    const form = await req.formData();

    const remark = String(form.get("remark") || "").trim();
    const revisionTarget = String(form.get("target") || "ECU").toUpperCase();

    const ecuFile = form.get("ecuFile");
    const tcuFile = form.get("tcuFile");

    const order = await db.order.findUnique({
      where: { id },
      include: {
        revisions: true,
      },
    });

    if (!order) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const revisionUploads: Array<{
      kind: string;
      file: File;
      target: string;
    }> = [];

    if (ecuFile instanceof File && ecuFile.size > 0) {
      revisionUploads.push({
        kind: "ADMIN_ECU_REVISION",
        file: ecuFile,
        target: "ECU",
      });
    }

    if (tcuFile instanceof File && tcuFile.size > 0) {
      revisionUploads.push({
        kind: "ADMIN_TCU_REVISION",
        file: tcuFile,
        target: "TCU",
      });
    }

    if (revisionUploads.length === 0) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    for (const upload of revisionUploads) {
      const saved = await saveFile(
        upload.file,
        upload.kind === "ADMIN_TCU_REVISION"
          ? "admin-revision-tcu"
          : "admin-revision-ecu"
      );

      const existingRevisions = await db.orderRevision.findMany({
        where: {
          orderId: id,
          revisionTarget: upload.target,
        },
        orderBy: {
          revisionNo: "desc",
        },
        take: 1,
      });

      const nextRevisionNo =
        existingRevisions.length > 0
          ? existingRevisions[0].revisionNo + 1
          : 1;

      const orderFile = await db.orderFile.create({
        data: {
          orderId: id,
          kind: upload.kind,
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      });

      await db.orderRevision.create({
        data: {
          orderId: id,
          orderFileId: orderFile.id,
          revisionNo: nextRevisionNo,
          remark: remark || "Revision update",
          revisionTarget: upload.target,
        },
      });
    }

    await db.order.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
      },
    });

    try {
      await db.notification.create({
        data: {
          userId: order.userId,
          type: "REVISION_READY",
          title: "Revision file available",
          message:
            revisionUploads.length === 2
              ? "Your ECU and TCU revision files are ready."
              : revisionUploads[0].target === "TCU"
                ? "Your TCU revision file is ready."
                : "Your ECU revision file is ready.",
          orderId: id,
        },
      });
    } catch (err) {
      console.error("Revision notification failed:", err);
    }

    revalidatePath("/admin");
    revalidatePath("/dashboard");

    return NextResponse.redirect(new URL("/admin", req.url), 303);
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/upload-revision failed:", error);
    return NextResponse.redirect(new URL("/admin", req.url), 303);
  }
}