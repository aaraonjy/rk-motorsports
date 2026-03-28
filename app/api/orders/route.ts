import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { saveFile } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    console.log("POST /api/orders started");

    const form = await req.formData();
    const user = await getSessionUser();

    console.log("session user:", user?.id ?? "none");

    if (!user) {
      console.log("no user session, redirecting to /login");
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const productId = String(form.get("productId") || "");
    const vehicleBrand = String(form.get("vehicleBrand") || "");
    const vehicleModel = String(form.get("vehicleModel") || "");
    const vehicleYear = String(form.get("vehicleYear") || "");
    const ecuType = String(form.get("ecuType") || "");
    const requestDetails = String(form.get("requestDetails") || "");
    const file = form.get("file");

    console.log("productId:", productId);
    console.log("vehicle:", { vehicleBrand, vehicleModel, vehicleYear, ecuType });
    console.log("file present:", file instanceof File);

    if (file instanceof File) {
      console.log("file name:", file.name);
      console.log("file size:", file.size);
      console.log("file type:", file.type);
    }

    const product = await db.product.findUnique({ where: { id: productId } });

    console.log("product found:", !!product);

    if (!product || !(file instanceof File)) {
      console.log("invalid product or file, redirecting to /custom-tuning");
      return NextResponse.redirect(new URL("/custom-tuning", req.url), 303);
    }

    const saved = await saveFile(file, "customer-original");
    console.log("file saved:", saved);

    await db.order.create({
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

    console.log("order created successfully");

    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return NextResponse.json(
      { message: "Order submission failed. Check server logs." },
      { status: 500 }
    );
  }
}