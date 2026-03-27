import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { saveFile } from "@/lib/storage";

export async function POST(req: Request) {
  const form = await req.formData();
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const productId = String(form.get("productId") || "");
  const vehicleBrand = String(form.get("vehicleBrand") || "");
  const vehicleModel = String(form.get("vehicleModel") || "");
  const vehicleYear = String(form.get("vehicleYear") || "");
  const ecuType = String(form.get("ecuType") || "");
  const requestDetails = String(form.get("requestDetails") || "");
  const file = form.get("file");

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product || !(file instanceof File)) {
    return NextResponse.redirect(new URL("/custom-tuning", req.url));
  }

  const saved = await saveFile(file, "customer-original");

  const order = await db.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      userId: user.id,
      totalAmount: product.basePrice,
      requestDetails,
      vehicleBrand,
      vehicleModel,
      vehicleYear,
      ecuType,
      status: "FILE_RECEIVED",
      items: {
        create: {
          productId: product.id,
          price: product.basePrice,
          quantity: 1,
        },
      },
      files: {
        create: {
          kind: "CUSTOMER_ORIGINAL",
          fileName: saved.fileName,
          storagePath: saved.storagePath,
          mimeType: saved.mimeType,
        },
      },
    },
  });

  return NextResponse.redirect(new URL(`/dashboard`, req.url));
}
