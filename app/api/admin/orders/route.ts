import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderDocumentNumber } from "@/lib/document-number";
import { createAdminNotification } from "@/lib/notifications";
import { calculatePaymentSummary } from "@/lib/payment-summary";
import { saveFile } from "@/lib/storage";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  calculateLineItemTaxBreakdown,
  calculateTaxBreakdown,
  getTaxDisplayLabel,
  normalizeTaxCalculationMode,
} from "@/lib/tax";

type CustomOrderItemPayload = {
  inventoryProductId?: string | null;
  productCodeSnapshot?: string | null;
  itemTypeSnapshot?: "STOCK_ITEM" | "SERVICE_ITEM" | "NON_STOCK_ITEM" | null;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  uom?: string | null;
  taxCodeId?: string | null;
  taxCode?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
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

    const taxConfig = await db.taxConfiguration.findUnique({ where: { id: "default" } });
    const taxCalculationMode = normalizeTaxCalculationMode(taxConfig?.taxCalculationMode);
    const isLineItemTaxMode = Boolean(taxConfig?.taxModuleEnabled && taxCalculationMode === "LINE_ITEM");

    const normalizedItemsBase = items
      .map((item) => {
        const inventoryProductId = String(item.inventoryProductId || "").trim();
        const productCodeSnapshot = String(item.productCodeSnapshot || "").trim().toUpperCase();
        const itemTypeSnapshot = String(item.itemTypeSnapshot || "").trim();
        const description = String(item.description || "").trim();
        const qty = Math.max(1, sanitizeWholeNumber(item.qty));
        const unitPrice = Math.max(0, sanitizeMoneyAmount(item.unitPrice));
        const lineTotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
        const uom = String(item.uom || "").trim();
        const submittedTaxCodeId = String(item.taxCodeId || "").trim();
        const submittedTaxRate = sanitizeMoneyAmount(item.taxRate);
        const submittedTaxAmount = Math.max(0, sanitizeMoneyAmount(item.taxAmount));

        return {
          inventoryProductId,
          productCodeSnapshot,
          itemTypeSnapshot,
          description,
          qty,
          unitPrice,
          lineTotal,
          uom: uom || null,
          submittedTaxCodeId,
          submittedTaxRate,
          submittedTaxAmount,
        };
      })
      .filter((item) => item.description.length > 0);

    if (normalizedItemsBase.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Please provide at least one valid line item." },
        { status: 400 }
      );
    }

    const submittedInventoryProductIds = Array.from(
      new Set(
        normalizedItemsBase
          .map((item) => item.inventoryProductId)
          .filter(Boolean)
      )
    );

    const inventoryProducts = submittedInventoryProductIds.length
      ? await db.inventoryProduct.findMany({
          where: {
            id: { in: submittedInventoryProductIds },
          },
        })
      : [];

    const inventoryProductMap = new Map(inventoryProducts.map((item) => [item.id, item]));

    for (const item of normalizedItemsBase) {
      const selectedProduct = item.inventoryProductId
        ? inventoryProductMap.get(item.inventoryProductId) || null
        : null;

      if (item.inventoryProductId && !selectedProduct) {
        throw new Error("Selected product is invalid or inactive.");
      }

      if (selectedProduct && !selectedProduct.isActive) {
        throw new Error("Selected product is invalid or inactive.");
      }

      if (selectedProduct && item.productCodeSnapshot && item.productCodeSnapshot !== selectedProduct.code) {
        throw new Error("Selected product information is outdated. Please reselect the product and try again.");
      }
    }

    const calculatedSubtotal = Math.round((normalizedItemsBase.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    ) + Number.EPSILON) * 100) / 100;
    const customDiscount = Math.max(0, sanitizeMoneyAmount(form.get("customDiscount")));

    const customSubtotal = sanitizeMoneyAmount(form.get("customSubtotal"));
    const submittedGrandTotal = sanitizeMoneyAmount(form.get("customGrandTotal"));
    const submittedTaxCodeId = String(form.get("taxCodeId") || "").trim();

    let normalizedItems = normalizedItemsBase.map((item) => {
      const selectedProduct = item.inventoryProductId
        ? inventoryProductMap.get(item.inventoryProductId) || null
        : null;

      return {
        inventoryProductId: selectedProduct?.id ?? null,
        productCodeSnapshot: selectedProduct?.code ?? null,
        itemTypeSnapshot:
          selectedProduct?.itemType ??
          (item.itemTypeSnapshot === "SERVICE_ITEM" ||
          item.itemTypeSnapshot === "NON_STOCK_ITEM" ||
          item.itemTypeSnapshot === "STOCK_ITEM"
            ? item.itemTypeSnapshot
            : null),
        description: item.description,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        uom: item.uom,
        taxCodeId: null as string | null,
        taxCode: null as string | null,
        taxRate: null as number | null,
        taxAmount: 0,
      };
    });

    let orderTaxCodeId: string | null = null;
    let orderTaxCode: string | null = null;
    let orderTaxDescription: string | null = null;
    let orderTaxDisplayLabel: string | null = null;
    let orderTaxRate: number | null = null;
    let orderTaxCalculationMethod: "EXCLUSIVE" | "INCLUSIVE" | null = null;
    let orderTaxAmount = 0;
    let orderTaxableSubtotal = 0;
    let orderGrandTotalAfterTax = Math.max(calculatedSubtotal - customDiscount, 0);
    let orderIsTaxEnabledSnapshot = false;
    let taxCodeLabelForRequest = "No tax";

    if (isLineItemTaxMode) {
      const submittedTaxCodeIds = Array.from(
        new Set(
          normalizedItemsBase
            .map((item) => item.submittedTaxCodeId)
            .filter(Boolean)
        )
      );

      const availableTaxCodes = submittedTaxCodeIds.length
        ? await db.taxCode.findMany({
            where: {
              id: { in: submittedTaxCodeIds },
              isActive: true,
            },
          })
        : [];

      const taxCodeMap = new Map(availableTaxCodes.map((item) => [item.id, item]));

      normalizedItems = normalizedItemsBase.map((item) => {
        const selectedProduct = item.inventoryProductId
          ? inventoryProductMap.get(item.inventoryProductId) || null
          : null;

        if (item.inventoryProductId && !selectedProduct) {
          throw new Error("Selected product is invalid or inactive.");
        }

        if (selectedProduct && !selectedProduct.isActive) {
          throw new Error("Selected product is invalid or inactive.");
        }

        if (selectedProduct && item.productCodeSnapshot && item.productCodeSnapshot !== selectedProduct.code) {
          throw new Error("Selected product information is outdated. Please reselect the product and try again.");
        }

        const selectedTaxCode = item.submittedTaxCodeId
          ? taxCodeMap.get(item.submittedTaxCodeId) || null
          : null;

        if (item.submittedTaxCodeId && !selectedTaxCode) {
          throw new Error("Selected tax code is invalid or inactive.");
        }

        const lineTaxBreakdown = calculateLineItemTaxBreakdown({
          lineTotal: item.lineTotal,
          taxRate: selectedTaxCode ? Number(selectedTaxCode.rate) : null,
          calculationMethod: selectedTaxCode?.calculationMethod ?? null,
          taxEnabled: Boolean(taxConfig?.taxModuleEnabled && selectedTaxCode),
        });

        if (selectedTaxCode) {
          if (
            !nearlyEqual(item.submittedTaxRate, Number(selectedTaxCode.rate)) ||
            !nearlyEqual(item.submittedTaxAmount, lineTaxBreakdown.taxAmount)
          ) {
            throw new Error("Order totals are invalid. Please refresh and try again.");
          }
        } else if (!nearlyEqual(item.submittedTaxAmount, 0)) {
          throw new Error("Order totals are invalid. Please refresh and try again.");
        }

        return {
          inventoryProductId: selectedProduct?.id ?? null,
          productCodeSnapshot: selectedProduct?.code ?? null,
          itemTypeSnapshot: selectedProduct?.itemType ?? (item.itemTypeSnapshot === "SERVICE_ITEM" || item.itemTypeSnapshot === "NON_STOCK_ITEM" ? item.itemTypeSnapshot : item.itemTypeSnapshot === "STOCK_ITEM" ? item.itemTypeSnapshot : null),
          description: item.description,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          uom: item.uom,
          taxCodeId: selectedTaxCode?.id ?? null,
          taxCode: selectedTaxCode?.code ?? null,
          taxRate: selectedTaxCode ? Number(selectedTaxCode.rate) : null,
          taxAmount: lineTaxBreakdown.taxAmount,
        };
      });

      const taxableRows = normalizedItems.filter((item) => item.taxCodeId && item.taxAmount > 0);
      const distinctTaxCodes = Array.from(new Set(taxableRows.map((item) => item.taxCode).filter(Boolean)));
      orderTaxAmount = Math.round((normalizedItems.reduce((sum, item) => sum + item.taxAmount, 0) + Number.EPSILON) * 100) / 100;
      orderTaxableSubtotal = Math.round((taxableRows.reduce((sum, item) => sum + item.lineTotal, 0) + Number.EPSILON) * 100) / 100;
      orderGrandTotalAfterTax = Math.round((Math.max(calculatedSubtotal - customDiscount, 0) + orderTaxAmount + Number.EPSILON) * 100) / 100;
      orderIsTaxEnabledSnapshot = orderTaxAmount > 0;

      if (distinctTaxCodes.length === 1) {
        const onlyTaxedRow = taxableRows.find((item) => item.taxCode === distinctTaxCodes[0]) || null;
        orderTaxCodeId = onlyTaxedRow?.taxCodeId ?? null;
        orderTaxCode = onlyTaxedRow?.taxCode ?? null;
        orderTaxRate = onlyTaxedRow?.taxRate ?? null;
        const matchedTaxCode = onlyTaxedRow?.taxCodeId ? taxCodeMap.get(onlyTaxedRow.taxCodeId) || null : null;
        orderTaxDescription = matchedTaxCode?.description ?? null;
        orderTaxCalculationMethod = matchedTaxCode?.calculationMethod ?? null;
        orderTaxDisplayLabel = matchedTaxCode
          ? getTaxDisplayLabel({
              code: matchedTaxCode.code,
              description: matchedTaxCode.description,
              rate: Number(matchedTaxCode.rate),
            })
          : null;
        taxCodeLabelForRequest = orderTaxCode || "No tax";
      } else if (distinctTaxCodes.length > 1) {
        orderTaxCode = "MULTIPLE";
        orderTaxDescription = "Multiple tax codes";
        orderTaxDisplayLabel = `Multiple tax codes (${distinctTaxCodes.join(", ")})`;
        taxCodeLabelForRequest = `Multiple tax codes (${distinctTaxCodes.join(", ")})`;
      }
    } else {
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

      orderTaxCodeId = selectedTaxCode?.id ?? null;
      orderTaxCode = selectedTaxCode?.code ?? null;
      orderTaxDescription = selectedTaxCode?.description ?? null;
      orderTaxDisplayLabel = selectedTaxCode
        ? getTaxDisplayLabel({
            code: selectedTaxCode.code,
            description: selectedTaxCode.description,
            rate: Number(selectedTaxCode.rate),
          })
        : null;
      orderTaxRate = selectedTaxCode ? Number(selectedTaxCode.rate) : null;
      orderTaxCalculationMethod = selectedTaxCode?.calculationMethod ?? null;
      orderTaxAmount = taxBreakdown.taxAmount;
      orderTaxableSubtotal = taxBreakdown.taxableSubtotal;
      orderGrandTotalAfterTax = taxBreakdown.grandTotalAfterTax;
      orderIsTaxEnabledSnapshot = taxBreakdown.isTaxApplied;
      taxCodeLabelForRequest = selectedTaxCode?.code || "No tax";
    }

    if (!nearlyEqual(customSubtotal, calculatedSubtotal) || !nearlyEqual(submittedGrandTotal, orderGrandTotalAfterTax)) {
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

    if (paymentAmount > orderGrandTotalAfterTax) {
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
      orderGrandTotalAfterTax
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
      `Tax Code: ${taxCodeLabelForRequest}`,
      `Tax Amount: RM${orderTaxAmount.toFixed(2)}`,
      `Grand Total: RM${orderGrandTotalAfterTax.toFixed(2)}`,
      `Initial Payment: RM${paymentAmount.toFixed(2)}`,
      `Items: ${normalizedItems.length}`,
      `Linked Products: ${normalizedItems.filter((item) => item.inventoryProductId).length}`,
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
        customGrandTotal: orderGrandTotalAfterTax,
        taxCodeId: orderTaxCodeId,
        taxCode: orderTaxCode,
        taxDescription: orderTaxDescription,
        taxDisplayLabel: orderTaxDisplayLabel,
        taxRate: orderTaxRate,
        taxCalculationMethod: orderTaxCalculationMethod,
        taxAmount: orderTaxAmount,
        taxableSubtotal: orderTaxableSubtotal,
        grandTotalAfterTax: orderGrandTotalAfterTax,
        isTaxEnabledSnapshot: orderIsTaxEnabledSnapshot,
        totalAmount: orderGrandTotalAfterTax,
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
      { ok: false, error: error instanceof Error && error.message ? error.message : "Unable to create custom order right now." },
      { status: 500 }
    );
  }
}
