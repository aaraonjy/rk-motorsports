import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { createAdminNotification } from "@/lib/notifications";
import { calculatePaymentSummary } from "@/lib/payment-summary";
import { saveFile } from "@/lib/storage";

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

function isAllowedPaymentMode(value: string) {
  return ["CASH", "CARD", "BANK_TRANSFER", "QR"].includes(value);
}

function isAllowedSupportingFile(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
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
    const vehicleNo = String(form.get("vehicleNo") || "").trim().toUpperCase();
    const internalRemarks = String(form.get("internalRemarks") || "").trim();
    const itemsRaw = String(form.get("items") || "[]");
    const items = JSON.parse(itemsRaw) as CustomOrderItemPayload[];
    const paymentMode = String(form.get("paymentMode") || "CASH").trim().toUpperCase();
    const paymentAmount = sanitizeWholeNumber(form.get("paymentAmount"));

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
        const unitPrice = Math.max(0, sanitizeWholeNumber(item.unitPrice));
        const lineTotal = qty * unitPrice;
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

    const calculatedSubtotal = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    );
    const customDiscount = Math.max(0, sanitizeWholeNumber(form.get("customDiscount")));
    const calculatedGrandTotal = Math.max(calculatedSubtotal - customDiscount, 0);

    const customSubtotal = sanitizeWholeNumber(form.get("customSubtotal"));
    const customGrandTotal = sanitizeWholeNumber(form.get("customGrandTotal"));

    if (customSubtotal !== calculatedSubtotal || customGrandTotal !== calculatedGrandTotal) {
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

    if (paymentAmount > calculatedGrandTotal) {
      return NextResponse.json(
        { ok: false, error: "Payment amount cannot exceed the grand total." },
        { status: 400 }
      );
    }

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
      calculatedGrandTotal
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

    const requestDetailsLines = [
      `Order Type: Custom Order`,
      `Title / Summary: ${customTitle}`,
      `Vehicle No: ${vehicleNo || "None"}`,
      `Internal Remarks: ${internalRemarks || "None"}`,
      `Subtotal: RM${calculatedSubtotal}`,
      `Discount: RM${customDiscount}`,
      `Grand Total: RM${calculatedGrandTotal}`,
      `Initial Payment: RM${paymentAmount}`,
      `Items: ${normalizedItems.length}`,
    ];

    const order = await db.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: customer.id,
        createdByAdminId: user.id,
        status: "AWAITING_PAYMENT",
        orderType: "CUSTOM_ORDER",
        customTitle,
        vehicleNo: vehicleNo || null,
        internalRemarks: internalRemarks || null,
        customSubtotal: calculatedSubtotal,
        customDiscount,
        customGrandTotal: calculatedGrandTotal,
        totalAmount: calculatedGrandTotal,
        totalPaid: paymentSummary.totalPaid,
        outstandingBalance: paymentSummary.outstandingBalance,
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
      redirectTo: "/admin",
    });
  } catch (error) {
    console.error("POST /api/admin/orders failed:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create custom order right now." },
      { status: 500 }
    );
  }
}
