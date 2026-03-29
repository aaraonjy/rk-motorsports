import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { saveFile } from "@/lib/storage";

const tunePrices: Record<string, number> = {
  "Stage 1 ECU Tune": 1500,
  "Stage 2 ECU Tune": 2200,
  "Custom File Service": 1800,
};

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const productId = String(form.get("productId") || "");
    const vehicleBrand = String(form.get("vehicleBrand") || "").trim();
    const vehicleModel = String(form.get("vehicleModel") || "").trim();
    const engineModel = String(form.get("engineModel") || "").trim();
    const engineCapacity = String(form.get("engineCapacity") || "").trim();
    const vehicleYear = String(form.get("vehicleYear") || "").trim();
    const ecuType = String(form.get("ecuType") || "").trim();
    const ecuReadTool = String(form.get("ecuReadTool") || "").trim();
    const fuelGrade = String(form.get("fuelGrade") || "").trim();
    const waterMethanolInjection = String(
      form.get("waterMethanolInjection") || ""
    ).trim();
    const tunePackage = String(form.get("tunePackage") || "").trim();
    const remarks = String(form.get("remarks") || "").trim();
    const estimatedTotalRaw = Number(form.get("estimatedTotal") || 0);

    const selectedAddOns = form
      .getAll("addOns")
      .map((value) => String(value).trim())
      .filter(Boolean);

    const file = form.get("file");

    const product = await db.product.findUnique({
      where: { id: productId },
    });

    const missingVehicleData =
      !vehicleBrand || !vehicleModel || !engineModel || !vehicleYear;

    if (
      !product ||
      !(file instanceof File) ||
      !tunePackage ||
      missingVehicleData ||
      !ecuType ||
      !ecuReadTool ||
      !fuelGrade
    ) {
      return NextResponse.redirect(new URL("/custom-tuning", req.url), 303);
    }

    const safeBasePrice = tunePrices[tunePackage] ?? product.basePrice;
    const calculatedTotal = safeBasePrice + selectedAddOns.length * 300;
    const finalTotal =
      estimatedTotalRaw > 0 ? estimatedTotalRaw : calculatedTotal;

    const requestDetailsLines = [
      `Base Tune: ${tunePackage}`,
      `Add-ons: ${
        selectedAddOns.length > 0 ? selectedAddOns.join(", ") : "None"
      }`,
      `ECU Read Tool: ${ecuReadTool}`,
      `Fuel Grade: ${fuelGrade}`,
      `Water Methanol Injection: ${
        waterMethanolInjection || "Not selected"
      }`,
      `Remarks: ${remarks || "None"}`,
    ];

    const requestDetails = requestDetailsLines.join("\n");

    const saved = await saveFile(file, "customer-original");

    await db.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        totalAmount: finalTotal,
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
            price: finalTotal,
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