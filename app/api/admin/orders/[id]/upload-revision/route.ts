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
    const file = form.get("file");
    const remark = String(form.get("remark") || "").trim();

    if (!(file instanceof File) || file.size === 0 || !remark) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: {
        files: true,
        revisions: {
          orderBy: { revisionNo: "desc" },
        },
      },
    });

    if (!order) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const mainTunedFile = order.files.find((f) => f.kind === "ADMIN_COMPLETED");

    if (!mainTunedFile) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    if (!["READY_FOR_DOWNLOAD", "COMPLETED"].includes(order.status)) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const nextRevisionNo = (order.revisions[0]?.revisionNo || 0) + 1;
    const saved = await saveFile(file, "admin-revision");

    const revisionFile = await db.orderFile.create({
      data: {
        orderId: id,
        kind: "ADMIN_REVISION",
        fileName: saved.fileName,
        storagePath: saved.storagePath,
        mimeType: saved.mimeType,
      },
    });

    await db.orderRevision.create({
      data: {
        orderId: id,
        orderFileId: revisionFile.id,
        revisionNo: nextRevisionNo,
        remark,
      },
    });

    try {
      await db.notification.create({
        data: {
          userId: order.userId,
          type: "REVISION_READY",
          title: "Revision ready",
          message: "Revision tune file is available to download.",
          orderId: id,
        },
      });
    } catch (err) {
      console.error("Customer notification failed:", err);
    }

    revalidatePath("/admin");
    revalidatePath("/dashboard");

    return NextResponse.redirect(new URL("/admin", req.url), 303);
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/upload-revision failed:", error);
    return NextResponse.redirect(new URL("/admin", req.url), 303);
  }
}