import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderDocumentNumber } from "@/lib/document-number";
import { createAdminNotification } from "@/lib/notifications";
import { calculatePaymentSummary } from "@/lib/payment-summary";
import { saveFile } from "@/lib/storage";
import { createAuditLogFromRequest } from "@/lib/audit";
import { calculateTaxBreakdown, getTaxDisplayLabel } from "@/tax";

type CustomOrderItemPayload = {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  uom?: string | null;
};

function sanitizeWholeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function sanitizeMoneyAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function isAllowedPaymentMode(value: string) {
  return ["CASH", "CARD", "BANK_TRANSFER", "QR"].includes(value);
}

function isAllowedSupportingFile(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function hasSpacing(value: string) {
  return /\s/.test(value);
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "You must be logged in." },
        { status: 401 }
      );
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Only admin can create custom orders." },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const orderType = String(form.get("orderType") || "").trim();

    if (orderType !== "CUSTOM_ORDER") {
      return NextResponse.json(
        { ok: false, error: "Unsupported order type." },
        { status: 400 }
      );
    }

    const customerId = String(form.get("customerId") || "").trim();
    const customTitle = String(form.get("customTitle") || "").trim();
    const rawVehicleNo = String(form.get("vehicleNo") || "");
    const vehicleNo = rawVehicleNo.trim().toUpperCase();
    const internalRemarks = String(form.get("internalRemarks") || "").trim();
    const itemsRaw = String(form.get("items") || "[]");
    const items = JSON.parse(itemsRaw) as CustomOrderItemPayload[];
    const paymentMode = String(form.get("paymentMode") || "CASH").trim().toUpperCase();
    const paymentAmount = sanitizeMoneyAmount(form.get("paymentAmount"));

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "Customer is required." },
        { status: 400 }
      );
    }

    if (!customTitle) {
      return NextResponse.json(
        { ok: false, error: "Order title / summary is required." },
        { status: 400 }
      );
    }

    if (hasSpacing(rawVehicleNo)) {
      return NextResponse.json(
        { ok: false, error: "No spacing is allowed in Vehicle No." },
        { status: 400 }
      );
    }

    const customer = await db.user.findFirst({
      where: {
        id: customerId,
        role: "CUSTOMER",
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "Selected customer not found." },
        { status: 404 }
      );
    }

    const normalizedItems = items
      .map((item) => {
        const description = String(item.description || "").trim();
        const qty = Math.max(1, sanitizeWholeNumber(item.qty));
        const unitPrice = Math.max(0, sanitizeMoneyAmount(item.unitPrice));
        const lineTotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
        const uom = String(item.uom || "").trim();

        return {
          description,
          qty,
          unitPrice,
          lineTotal,
          uom: uom || null,
        };
      })
      .filter((item) => item.description.length > 0);

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Please provide at least one valid line item." },
        { status: 400 }
      );
    }

    const calculatedSubtotal = Math.round((normalizedItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    ) + Number.EPSILON) * 100) / 100;
    const customDiscount = Math.max(0, sanitizeMoneyAmount(form.get("customDiscount")));
    const taxableSubtotal = Math.round((Math.max(calculatedSubtotal - customDiscount, 0) + Number.EPSILON) * 100) / 100;

    const customSubtotal = sanitizeMoneyAmount(form.get("customSubtotal"));
    const submittedGrandTotal = sanitizeMoneyAmount(form.get("customGrandTotal"));
    const submittedTaxCodeId = String(form.get("taxCodeId") || "").trim();

    const taxConfig = await db.taxConfiguration.findUnique({ where: { id: "default" } });
    let selectedTaxCode = null;
    if (taxConfig?.taxModuleEnabled && submittedTaxCodeId) {
      selectedTaxCode = await db.taxCode.findFirst({
        where: {
          id: submittedTaxCodeId,
          isActive: true,
        },
      });

      if (!selectedTaxCode) {
        return NextResponse.json(
          { ok: false, error: "Selected tax code is invalid or inactive." },
          { status: 400 }
        );
      }
    }

    const taxBreakdown = calculateTaxBreakdown({
      subtotal: calculatedSubtotal,
      discount: customDiscount,
      taxRate: selectedTaxCode ? Number(selectedTaxCode.rate) : null,
      calculationMethod: selectedTaxCode?.calculationMethod ?? null,
      taxEnabled: Boolean(taxConfig?.taxModuleEnabled && selectedTaxCode),
    });

    if (!nearlyEqual(customSubtotal, calculatedSubtotal) || !nearlyEqual(submittedGrandTotal, taxBreakdown.grandTotalAfterTax)) {
      return NextResponse.json(
        { ok: false, error: "Order totals are invalid. Please refresh and try again." },
        { status: 400 }
      );
    }

    const supportingFiles = form
      .getAll("supportingFiles")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (supportingFiles.length > 5) {
      return NextResponse.json(
        { ok: false, error: "Maximum 5 supporting files are allowed." },
        { status: 400 }
      );
    }

    const supportingFilesTotalSize = supportingFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );

    if (supportingFilesTotalSize > 25 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Total supporting file size must not exceed 25MB." },
        { status: 400 }
      );
    }

    if (!supportingFiles.every(isAllowedSupportingFile)) {
      return NextResponse.json(
        { ok: false, error: "Supporting documents only allow image or video files." },
        { status: 400 }
      );
    }

    if (paymentAmount > 0 && !isAllowedPaymentMode(paymentMode)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payment mode." },
        { status: 400 }
      );
    }

    if (paymentAmount > taxBreakdown.grandTotalAfterTax) {
      return NextResponse.json(
        { ok: false, error: "Payment amount cannot exceed the grand total." },
        { status: 400 }
      );
    }

    const documentDateRaw = String(form.get("documentDate") || "").trim();
    const documentDate = documentDateRaw ? new Date(documentDateRaw) : new Date();
    if (Number.isNaN(documentDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Invalid document date." },
        { status: 400 }
      );
    }
    documentDate.setHours(0, 0, 0, 0);

    const paymentDateRaw = String(form.get("paymentDate") || "").trim();
    const paymentDate = paymentDateRaw ? new Date(paymentDateRaw) : new Date();
    if (paymentAmount > 0) {
      if (Number.isNaN(paymentDate.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Invalid payment date." },
          { status: 400 }
        );
      }
      paymentDate.setHours(0, 0, 0, 0);
    }

    const paymentSummary = calculatePaymentSummary(
      paymentAmount > 0 ? [{ amount: paymentAmount }] : [],
      taxBreakdown.grandTotalAfterTax
    );

    const supportingFilesToCreate: Array<{
      kind: string;
      fileName: string;
      storagePath: string;
      mimeType: string | null;
    }> = [];

    for (const file of supportingFiles) {
      const savedFile = await saveFile(file, "custom-order-supporting-doc");
      supportingFilesToCreate.push({
        kind: "SUPPORTING_DOC",
        fileName: savedFile.fileName,
        storagePath: savedFile.storagePath,
        mimeType: savedFile.mimeType,
      });
    }

    const docType = Number(paymentSummary.outstandingBalance || 0) > 0 ? "INV" : "CS";
    const orderNumber = await generateOrderDocumentNumber(docType, documentDate);

    const requestDetailsLines = [
      `Order Type: Custom Order`,
      `Document Date: ${documentDateRaw || documentDate.toISOString().slice(0, 10)}`,
      `Title / Summary: ${customTitle}`,
      `Vehicle No: ${vehicleNo || "None"}`,
      `Internal Remarks: ${internalRemarks || "None"}`,
      `Subtotal: RM${calculatedSubtotal.toFixed(2)}`,
      `Discount: RM${customDiscount.toFixed(2)}`,
      `Tax Code: ${selectedTaxCode?.code || "No tax"}`,
      `Tax Amount: RM${taxBreakdown.taxAmount.toFixed(2)}`,
      `Grand Total: RM${taxBreakdown.grandTotalAfterTax.toFixed(2)}`,
      `Initial Payment: RM${paymentAmount.toFixed(2)}`,
      `Items: ${normalizedItems.length}`,
    ];

    const order = await db.order.create({
      data: {
        orderNumber,
        userId: customer.id,
        createdByAdminId: user.id,
        source: "ADMIN_PORTAL",
        docType,
        status: "AWAITING_PAYMENT",
        orderType: "CUSTOM_ORDER",
        documentDate,
        customTitle,
        vehicleNo: vehicleNo || null,
        internalRemarks: internalRemarks || null,
        customSubtotal: calculatedSubtotal,
        customDiscount,
        customGrandTotal: taxableSubtotal,
        taxCodeId: selectedTaxCode?.id ?? null,
        taxCode: selectedTaxCode?.code ?? null,
        taxDescription: selectedTaxCode?.description ?? null,
        taxDisplayLabel: selectedTaxCode
          ? getTaxDisplayLabel({
              code: selectedTaxCode.code,
              description: selectedTaxCode.description,
              rate: Number(selectedTaxCode.rate),
            })
          : null,
        taxRate: selectedTaxCode ? Number(selectedTaxCode.rate) : null,
        taxCalculationMethod: selectedTaxCode?.calculationMethod ?? null,
        taxAmount: taxBreakdown.taxAmount,
        taxableSubtotal: taxBreakdown.taxableSubtotal,
        grandTotalAfterTax: taxBreakdown.grandTotalAfterTax,
        isTaxEnabledSnapshot: taxBreakdown.isTaxApplied,
        totalAmount: taxBreakdown.grandTotalAfterTax,
        totalPaid: Number(paymentSummary.totalPaid || 0),
        outstandingBalance: Number(paymentSummary.outstandingBalance || 0),
        requestDetails: requestDetailsLines.join("\n"),
        customItems: {
          create: normalizedItems,
        },
        files: supportingFilesToCreate.length
          ? {
              create: supportingFilesToCreate,
            }
          : undefined,
        payments:
          paymentAmount > 0
            ? {
                create: {
                  paymentDate,
                  paymentMode,
                  amount: paymentAmount,
                },
              }
            : undefined,
      },
    });

    try {
      await createAdminNotification({
        type: "ORDER_SUBMITTED",
        title: "New custom order created",
        message: `${user.name} created a custom order for ${customer.name}.`,
        orderId: order.id,
      });
    } catch (error) {
      console.error("Notification creation failed:", error);
    }

    return NextResponse.json({
      ok: true,
      redirectTo: "/admin?success=custom_order_created",
    });
  } catch (error) {
    console.error("POST /api/admin/orders failed:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create custom order right now." },
      { status: 500 }
    );
  }
}
