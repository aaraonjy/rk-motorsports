import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderDocumentNumber } from "@/lib/document-number";
import {
  saveFile,
  validatePackageUploadFiles,
  validateSingleUploadFile,
} from "@/lib/storage";
import { createAdminNotification } from "@/lib/notifications";
import {
  calculateAddOnTotal,
  calculateBaseTuneTotal,
} from "@/lib/tuning-pricing";
import {
  RATE_LIMIT_RULES,
  buildRateLimitHeaders,
  checkRateLimit,
  createRateLimitKey,
} from "@/lib/rate-limit";
import { calculateTaxBreakdown, getTaxDisplayLabel } from "@/lib/tax";

function normalizeTuningType(value: string) {
  if (value === "TCU") return "TCU";
  if (value === "ECU_TCU") return "ECU_TCU";
  return "ECU";
}

function getOrderSubmittedRedirectPath(tuningType: string) {
  if (tuningType === "TCU") {
    return "/dashboard?success=order_submitted_tcu";
  }

  if (tuningType === "ECU_TCU") {
    return "/dashboard?success=order_submitted_ecu_tcu";
  }

  return "/dashboard?success=order_submitted_ecu";
}

function formatRetryAfterText(seconds: number) {
  if (seconds <= 59) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url), 303);
    }

    if (user.role !== "ADMIN") {
      const rateLimitResult = await checkRateLimit({
        key: createRateLimitKey("order-submit", "user", user.id),
        limit: RATE_LIMIT_RULES.orderSubmit.limit,
        windowMs: RATE_LIMIT_RULES.orderSubmit.windowMs,
      });

      if (!rateLimitResult.success) {
        const retryAfterSeconds = rateLimitResult.retryAfter;
        const retryAfterText = formatRetryAfterText(retryAfterSeconds);

        return NextResponse.json(
          {
            ok: false,
            error: `You have submitted too many orders in a short period. Please try again in ${retryAfterText}.`,
            retryAfterSeconds,
            retryAfterText,
          },
          {
            status: 429,
            headers: buildRateLimitHeaders(rateLimitResult),
          }
        );
      }
    }

    const productId = String(form.get("productId") || "");
    const adminMode = String(form.get("adminMode") || "") === "true";
    const targetCustomerId = String(form.get("customerId") || "").trim();
    const tuningType = normalizeTuningType(
      String(form.get("tuningType") || "ECU")
    );

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
    const currentEcuSetupStage = String(
      form.get("currentEcuSetupStage") || ""
    ).trim();
    const turboType = String(form.get("turboType") || "").trim();
    const turboSpec = String(form.get("turboSpec") || "").trim();
    const hardwareMods = String(form.get("hardwareMods") || "").trim();
    const fuelSystemMods = String(form.get("fuelSystemMods") || "").trim();
    const engineMods = String(form.get("engineMods") || "").trim();
    const engineModsOther = String(form.get("engineModsOther") || "").trim();
    const additionalDetails = String(form.get("additionalDetails") || "").trim();

    const remarks = String(form.get("remarks") || "").trim();
    const estimatedTotalRaw = Number(form.get("estimatedTotal") || 0);

    const selectedAddOns = form
      .getAll("addOns")
      .map((value) => String(value).trim())
      .filter(Boolean);

    const ecuFile = form.get("ecuFile");
    const tcuFile = form.get("tcuFile");

    let orderUserId = user.id;
    let createdByAdminId: string | null = null;

    if (adminMode) {
      if (user.role !== "ADMIN") {
        return NextResponse.json(
          { ok: false, error: "Only admin can create orders in admin mode." },
          { status: 403 }
        );
      }

      if (!targetCustomerId) {
        return NextResponse.json(
          { ok: false, error: "Customer is required for admin order creation." },
          { status: 400 }
        );
      }

      const targetCustomer = await db.user.findFirst({
        where: {
          id: targetCustomerId,
          role: "CUSTOMER",
        },
        select: { id: true, name: true },
      });

      if (!targetCustomer) {
        return NextResponse.json(
          { ok: false, error: "Selected customer not found." },
          { status: 404 }
        );
      }

      orderUserId = targetCustomer.id;
      createdByAdminId = user.id;
    }

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

    const missingFuelGrade = requiresEcu && !fuelGrade;

    if (
      !product ||
      missingVehicleData ||
      missingFuelGrade ||
      missingEcuData ||
      missingTcuData
    ) {
      return NextResponse.redirect(new URL("/custom-tuning", req.url), 303);
    }

    const uploadFiles: File[] = [];

    if (requiresEcu && ecuFile instanceof File && ecuFile.size > 0) {
      uploadFiles.push(ecuFile);
    }

    if (requiresTcu && tcuFile instanceof File && tcuFile.size > 0) {
      uploadFiles.push(tcuFile);
    }

    const validationMessage =
      uploadFiles.length > 1
        ? validatePackageUploadFiles(uploadFiles)
        : uploadFiles.length === 1
          ? validateSingleUploadFile(uploadFiles[0])
          : null;

    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
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
    const finalSubtotal = estimatedTotalRaw > 0 ? estimatedTotalRaw : calculatedTotal;

    const taxConfig = await db.taxConfiguration.findUnique({
      where: { id: "default" },
      include: {
        defaultPortalTaxCode: true,
      },
    });

    const portalTaxCode =
      taxConfig?.taxModuleEnabled && taxConfig.defaultPortalTaxCode?.isActive
        ? taxConfig.defaultPortalTaxCode
        : null;

    const taxBreakdown = calculateTaxBreakdown({
      subtotal: finalSubtotal,
      discount: 0,
      taxRate: portalTaxCode ? Number(portalTaxCode.rate) : null,
      calculationMethod: portalTaxCode?.calculationMethod ?? null,
      taxEnabled: Boolean(taxConfig?.taxModuleEnabled && portalTaxCode),
    });

    const finalTotal = taxBreakdown.grandTotalAfterTax;
    const docType = "INV";

    const requestDetailsLines = [
      `Tuning Type: ${tuningType}`,
      `Selected Package: ${selectedTuneLabel || "Not specified"}`,
      `ECU Stage: ${ecuStage || "Not selected"}`,
      `Current ECU Setup: ${currentEcuSetupStage || "Not selected"}`,
      `TCU Stage: ${tcuStage || "Not selected"}`,
      `Turbo Setup: ${turboType || "Not selected"}`,
      `Turbo Spec: ${turboSpec || "Not specified"}`,
      `Hardware Mods: ${hardwareMods || "None"}`,
      `Fuel System: ${fuelSystemMods || "None"}`,
      `Engine Mods: ${engineMods || "None"}`,
      `Other Engine Mods: ${engineModsOther || "None"}`,
      `Additional Details: ${additionalDetails || "None"}`,
      `Add-ons: ${
        selectedAddOns.length > 0 ? selectedAddOns.join(", ") : "None"
      }`,
      `ECU Read Tool: ${ecuReadTool || "Not selected"}`,
      `TCU Read Tool: ${tcuReadTool || "Not selected"}`,
      `TCU Version: ${tcuVersion || "Not selected"}`,
      `Fuel Grade: ${fuelGrade || "Not selected"}`,
      `Water Methanol Injection: ${
        waterMethanolInjection || "Not selected"
      }`,
      `Remarks: ${remarks || "None"}`,
      `Tax Code: ${portalTaxCode?.code || "No tax"}`,
      `Tax Amount: RM${taxBreakdown.taxAmount.toFixed(2)}`,
      `Grand Total After Tax: RM${taxBreakdown.grandTotalAfterTax.toFixed(2)}`,
    ];

    const requestDetails = requestDetailsLines.join("\n");
    const orderNumber = await generateOrderDocumentNumber(docType);

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
        userId: orderUserId,
        createdByAdminId,
        source: adminMode ? "ADMIN_PORTAL" : "ONLINE_PORTAL",
        docType,
        totalAmount: finalTotal,
        taxCodeId: portalTaxCode?.id ?? null,
        taxCode: portalTaxCode?.code ?? null,
        taxDescription: portalTaxCode?.description ?? null,
        taxDisplayLabel: portalTaxCode
          ? getTaxDisplayLabel({
              code: portalTaxCode.code,
              description: portalTaxCode.description,
              rate: Number(portalTaxCode.rate),
            })
          : null,
        taxRate: portalTaxCode ? Number(portalTaxCode.rate) : null,
        taxCalculationMethod: portalTaxCode?.calculationMethod ?? null,
        taxAmount: taxBreakdown.taxAmount,
        taxableSubtotal: taxBreakdown.taxableSubtotal,
        grandTotalAfterTax: taxBreakdown.grandTotalAfterTax,
        isTaxEnabledSnapshot: taxBreakdown.isTaxApplied,
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
        fuelGrade: fuelGrade || null,
        waterMethanolInjection: waterMethanolInjection || null,
        currentEcuSetupStage: currentEcuSetupStage || null,
        turboType: turboType || null,
        turboSpec: turboSpec || null,
        hardwareMods: hardwareMods || null,
        fuelSystemMods: fuelSystemMods || null,
        engineMods: engineMods || null,
        engineModsOther: engineModsOther || null,
        additionalDetails: additionalDetails || null,
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
        message: `${user.name} ${adminMode ? "created" : "submitted"} a new ${tuningType.replaceAll(
          "_",
          " + "
        )} order.`,
        orderId: order.id,
      });
    } catch (error) {
      console.error("Notification creation failed:", error);
    }

    return NextResponse.json({
      ok: true,
      redirectTo: adminMode ? "/admin" : getOrderSubmittedRedirectPath(tuningType),
    });
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return NextResponse.json(
      { ok: false, error: "Order submission failed. Please try again." },
      { status: 500 }
    );
  }
}