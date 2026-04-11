import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
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

function hasSpacing(value: string) {
  return /\s/.test(value);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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
        { ok: false, error: "Only admin can edit custom orders." },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;
    const form = await req.formData();

    const order = await db.order.findUnique({
      where: { id },
      include: {
        customItems: true,
        payments: {
          orderBy: { paymentDate: "asc" },
          select: {
            id: true,
            amount: true,
          },
        },
      },
    });

    if (!order || order.orderType !== "CUSTOM_ORDER") {
      return NextResponse.json(
        { ok: false, error: "Custom order not found." },
        { status: 404 }
      );
    }

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: "Completed or cancelled custom orders cannot be edited." },
        { status: 400 }
      );
    }

    const customerId = String(form.get("customerId") || "").trim();
    const customTitle = String(form.get("customTitle") || "").trim();
    const rawVehicleNo = String(form.get("vehicleNo") || "");
    const submittedVehicleNo = rawVehicleNo.trim().toUpperCase();
    const vehicleNo = submittedVehicleNo || order.vehicleNo || "";
    const internalRemarks = String(form.get("internalRemarks") || "").trim();
    const itemsRaw = String(form.get("items") || "[]");
    const items = JSON.parse(itemsRaw) as CustomOrderItemPayload[];
    const paymentMode = String(form.get("paymentMode") || "CASH").trim().toUpperCase();
    const paymentAmount = sanitizeWholeNumber(form.get("paymentAmount"));

    if (!customerId || customerId !== order.userId) {
      return NextResponse.json(
        { ok: false, error: "Customer information is invalid." },
        { status: 400 }
      );
    }

    if (!customTitle) {
      return NextResponse.json(
        { ok: false, error: "Description is required." },
        { status: 400 }
      );
    }

    if (hasSpacing(rawVehicleNo)) {
      return NextResponse.json(
        { ok: false, error: "No spacing is allowed in Vehicle No." },
        { status: 400 }
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

    const existingTotalPaid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);

    if (calculatedGrandTotal < existingTotalPaid) {
      return NextResponse.json(
        { ok: false, error: "Grand total cannot be lower than the total paid amount." },
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

    const currentOutstandingBalance = Math.max(calculatedGrandTotal - existingTotalPaid, 0);

    if (paymentAmount > currentOutstandingBalance) {
      return NextResponse.json(
        { ok: false, error: "Payment amount cannot exceed the outstanding balance." },
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

    const newPayments = [
      ...order.payments.map((payment) => ({ amount: payment.amount })),
      ...(paymentAmount > 0 ? [{ amount: paymentAmount }] : []),
    ];
    const paymentSummary = calculatePaymentSummary(newPayments, calculatedGrandTotal);

    const requestDetailsLines = [
      `Order Type: Custom Order`,
      `Title / Summary: ${customTitle}`,
      `Vehicle No: ${vehicleNo || "None"}`,
      `Internal Remarks: ${internalRemarks || "None"}`,
      `Subtotal: RM${calculatedSubtotal}`,
      `Discount: RM${customDiscount}`,
      `Grand Total: RM${calculatedGrandTotal}`,
      `New Payment Added: RM${paymentAmount}`,
      `Items: ${normalizedItems.length}`,
    ];

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

    await db.$transaction(async (tx) => {
      await tx.customOrderItem.deleteMany({
        where: { orderId: order.id },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
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
          files:
            supportingFilesToCreate.length
              ? {
                  create: supportingFilesToCreate,
                }
              : undefined,
        },
      });

      if (paymentAmount > 0) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            paymentDate,
            paymentMode,
            amount: paymentAmount,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      redirectTo: "/admin?success=custom_order_updated",
    });
  } catch (error) {
    console.error("PUT /api/admin/orders/[id] failed:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to update custom order right now." },
      { status: 500 }
    );
  }
}
