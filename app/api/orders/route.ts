import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { saveFile } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const productId = String(form.get("productId") || "");
    const vehicleBrand = String(form.get("vehicleBrand") || "");
    const vehicleModel = String(form.get("vehicleModel") || "");
    const engineModel = String(form.get("engineModel") || "");
    const engineCapacity = String(form.get("engineCapacity") || "");
    const vehicleYear = String(form.get("vehicleYear") || "");
    const ecuType = String(form.get("ecuType") || "");
    const requestDetails = String(form.get("requestDetails") || "");
    const file = form.get("file");

    const product = await db.product.findUnique({
      where: { id: productId },
    });

    if (!product || !(file instanceof File)) {
      return NextResponse.redirect(new URL("/custom-tuning", req.url), 303);
    }

    const saved = await saveFile(file, "customer-original");

    await db.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        totalAmount: product.basePrice,
        requestDetails,
        vehicleBrand,
        vehicleModel,
        engineModel,
        engineCapacity,
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

    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return NextResponse.json(
      { message: "Order submission failed. Check server logs." },
      { status: 500 }
    );
  }
}