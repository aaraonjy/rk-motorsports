import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
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
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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
    const paymentAmount = sanitizeMoneyAmount(form.get("paymentAmount"));

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

    const calculatedSubtotal = Math.round(
      (normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0) + Number.EPSILON) * 100
    ) / 100;
    const customDiscount = Math.max(0, sanitizeMoneyAmount(form.get("customDiscount")));
    const taxableSubtotal = Math.round(
      (Math.max(calculatedSubtotal - customDiscount, 0) + Number.EPSILON) * 100
    ) / 100;

    const customSubtotal = sanitizeMoneyAmount(form.get("customSubtotal"));
    const submittedGrandTotal = sanitizeMoneyAmount(form.get("customGrandTotal"));
    const submittedTaxCodeId = String(form.get("taxCodeId") || "").trim();

    const taxConfig = await db.taxConfiguration.findUnique({ where: { id: "default" } });
    let selectedTaxCode = null;
    if (taxConfig?.taxModuleEnabled && submittedTaxCodeId) {
      selectedTaxCode = await db.taxCode.findFirst({
        where: {
          id: submittedTaxCodeId,
          OR: [{ isActive: true }, { id: order.taxCodeId ?? "" }],
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

    const existingTotalPaid = order.payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    if (taxBreakdown.grandTotalAfterTax < existingTotalPaid) {
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

    const currentOutstandingBalance = Math.max(taxBreakdown.grandTotalAfterTax - existingTotalPaid, 0);

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
      ...order.payments.map((payment) => ({ amount: Number(payment.amount || 0) })),
      ...(paymentAmount > 0 ? [{ amount: paymentAmount }] : []),
    ];
    const paymentSummary = calculatePaymentSummary(newPayments, taxBreakdown.grandTotalAfterTax);

    const requestDetailsLines = [
      `Order Type: Custom Order`,
      `Title / Summary: ${customTitle}`,
      `Vehicle No: ${vehicleNo || "None"}`,
      `Internal Remarks: ${internalRemarks || "None"}`,
      `Subtotal: RM${calculatedSubtotal.toFixed(2)}`,
      `Discount: RM${customDiscount.toFixed(2)}`,
      `Tax Code: ${selectedTaxCode?.code || "No tax"}`,
      `Tax Amount: RM${taxBreakdown.taxAmount.toFixed(2)}`,
      `Grand Total: RM${taxBreakdown.grandTotalAfterTax.toFixed(2)}`,
      `New Payment Added: RM${paymentAmount.toFixed(2)}`,
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
