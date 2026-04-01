import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { saveFile } from "@/lib/storage";
import { createAdminNotification } from "@/lib/notifications";
import {
  calculateAddOnTotal,
  calculateBaseTuneTotal,
} from "@/lib/tuning-pricing";

function normalizeTuningType(value: string) {
  if (value === "TCU") return "TCU";
  if (value === "ECU_TCU") return "ECU_TCU";
  return "ECU";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    const productId = String(form.get("productId") || "");
    const tuningType = normalizeTuningType(String(form.get("tuningType") || "ECU"));

    const ecuStage = String(form.get("ecuStage") || "").trim();
    const tcuStage = String(form.get("tcuStage") || "").trim();
    const selectedTuneLabel = String(form.get("selectedTuneLabel") || "").trim();

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

    const tcuType = String(form.get("tcuType") || "").trim();
    const tcuReadTool = String(form.get("tcuReadTool") || "").trim();
    const tcuVersion = String(form.get("tcuVersion") || "").trim();

    const remarks = String(form.get("remarks") || "").trim();
    const estimatedTotalRaw = Number(form.get("estimatedTotal") || 0);

    const selectedAddOns = form
      .getAll("addOns")
      .map((value) => String(value).trim())
      .filter(Boolean);

    const ecuFile = form.get("ecuFile");
    const tcuFile = form.get("tcuFile");

    const product = await db.product.findUnique({
      where: { id: productId },
    });

    const requiresEcu = tuningType === "ECU" || tuningType === "ECU_TCU";
    const requiresTcu = tuningType === "TCU" || tuningType === "ECU_TCU";

    const missingVehicleData =
      !vehicleBrand || !vehicleModel || !engineModel || !vehicleYear;

    const missingEcuData =
      requiresEcu &&
      (!ecuStage ||
        !ecuType ||
        !ecuReadTool ||
        !(ecuFile instanceof File) ||
        ecuFile.size === 0);

    const missingTcuData =
      requiresTcu &&
      (!tcuStage ||
        !tcuType ||
        !tcuReadTool ||
        !tcuVersion ||
        !(tcuFile instanceof File) ||
        tcuFile.size === 0);

    if (
      !product ||
      missingVehicleData ||
      !fuelGrade ||
      missingEcuData ||
      missingTcuData
    ) {
      return NextResponse.redirect(new URL("/custom-tuning", req.url), 303);
    }

    const calculatedBaseTotal = calculateBaseTuneTotal({
      tuningType,
      ecuStage,
      tcuStage,
    });

    const calculatedAddOnTotal = requiresEcu
      ? calculateAddOnTotal(selectedAddOns)
      : 0;

    const calculatedTotal = calculatedBaseTotal + calculatedAddOnTotal;
    const finalTotal = estimatedTotalRaw > 0 ? estimatedTotalRaw : calculatedTotal;

    const requestDetailsLines = [
      `Tuning Type: ${tuningType}`,
      `Selected Package: ${selectedTuneLabel || "Not specified"}`,
      `ECU Stage: ${ecuStage || "Not selected"}`,
      `TCU Stage: ${tcuStage || "Not selected"}`,
      `Add-ons: ${selectedAddOns.length > 0 ? selectedAddOns.join(", ") : "None"}`,
      `ECU Read Tool: ${ecuReadTool || "Not selected"}`,
      `TCU Read Tool: ${tcuReadTool || "Not selected"}`,
      `TCU Version: ${tcuVersion || "Not selected"}`,
      `Fuel Grade: ${fuelGrade}`,
      `Water Methanol Injection: ${waterMethanolInjection || "Not selected"}`,
      `Remarks: ${remarks || "None"}`,
    ];

    const requestDetails = requestDetailsLines.join("\n");
    const orderNumber = generateOrderNumber();

    const filesToCreate: Array<{
      kind: string;
      fileName: string;
      storagePath: string;
      mimeType: string | null;
    }> = [];

    if (requiresEcu && ecuFile instanceof File && ecuFile.size > 0) {
      const savedEcu = await saveFile(ecuFile, "customer-ecu");
      filesToCreate.push({
        kind: "CUSTOMER_ECU",
        fileName: savedEcu.fileName,
        storagePath: savedEcu.storagePath,
        mimeType: savedEcu.mimeType,
      });
    }

    if (requiresTcu && tcuFile instanceof File && tcuFile.size > 0) {
      const savedTcu = await saveFile(tcuFile, "customer-tcu");
      filesToCreate.push({
        kind: "CUSTOMER_TCU",
        fileName: savedTcu.fileName,
        storagePath: savedTcu.storagePath,
        mimeType: savedTcu.mimeType,
      });
    }

    const order = await db.order.create({
      data: {
        orderNumber,
        userId: user.id,
        totalAmount: finalTotal,
        requestDetails,
        tuningType,
        selectedTuneId:
          tuningType === "ECU"
            ? ecuStage
            : tuningType === "TCU"
              ? tcuStage
              : `${ecuStage}_${tcuStage}`,
        selectedTuneLabel: selectedTuneLabel || null,
        ecuStage: ecuStage || null,
        tcuStage: tcuStage || null,
        vehicleBrand,
        vehicleModel,
        engineModel,
        engineCapacity,
        vehicleYear,
        ecuType: ecuType || null,
        ecuReadTool: ecuReadTool || null,
        fuelGrade,
        waterMethanolInjection: waterMethanolInjection || null,
        tcuType: tcuType || null,
        tcuReadTool: tcuReadTool || null,
        tcuVersion: tcuVersion || null,
        status: "FILE_RECEIVED",
        items: {
          create: {
            productId: product.id,
            price: finalTotal,
            quantity: 1,
          },
        },
        files: {
          create: filesToCreate,
        },
      },
    });

    try {
      await createAdminNotification({
        type: "ORDER_SUBMITTED",
        title: "New Order received",
        message: `${user.name} submitted a new ${tuningType.replaceAll("_", " + ")} order.`,
        orderId: order.id,
      });
    } catch (error) {
      console.error("Notification creation failed:", error);
    }

    return NextResponse.redirect(new URL("/dashboard", req.url), 303);
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return NextResponse.json(
      { message: "Order submission failed. Check server logs." },
      { status: 500 }
    );
  }
}