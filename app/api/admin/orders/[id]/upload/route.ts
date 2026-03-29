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

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const order = await db.order.findUnique({
      where: { id },
    });

    if (!order) {
      return NextResponse.redirect(new URL("/admin", req.url), 303);
    }

    const saved = await saveFile(file, "admin-tuned");

    const existingCompletedFile = await db.orderFile.findFirst({
      where: {
        orderId: id,
        kind: "ADMIN_COMPLETED",
      },
    });

    if (existingCompletedFile) {
      await db.orderFile.update({
        where: { id: existingCompletedFile.id },
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
          kind: "ADMIN_COMPLETED",
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      });
    }

    await db.order.update({
      where: { id },
      data: {
        status: "AWAITING_PAYMENT",
      },
    });

    revalidatePath("/admin");
    revalidatePath("/dashboard");

    return NextResponse.redirect(new URL("/admin", req.url), 303);
  } catch (error) {
    console.error("POST /api/admin/orders/[id]/upload failed:", error);
    return NextResponse.redirect(new URL("/admin", req.url), 303);
  }
}