import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { saveFile } from "@/lib/storage";

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

    // overwrite if already exists
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

    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  }
}