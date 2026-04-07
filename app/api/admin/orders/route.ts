import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { createAdminNotification } from "@/lib/notifications";

type CustomOrderItemPayload = {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

type CreateCustomOrderPayload = {
  orderType?: string;
  customerId?: string;
  customTitle?: string;
  internalRemarks?: string;
  customSubtotal?: number;
  customDiscount?: number;
  customGrandTotal?: number;
  items?: CustomOrderItemPayload[];
};

function sanitizeWholeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
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

    const body = (await req.json()) as CreateCustomOrderPayload;

    if (body.orderType !== "CUSTOM_ORDER") {
      return NextResponse.json(
        { ok: false, error: "Unsupported order type." },
        { status: 400 }
      );
    }

    const customerId = String(body.customerId || "").trim();
    const customTitle = String(body.customTitle || "").trim();
    const internalRemarks = String(body.internalRemarks || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

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

        return {
          description,
          qty,
          unitPrice,
          lineTotal,
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
    const customDiscount = Math.max(0, sanitizeWholeNumber(body.customDiscount));
    const calculatedGrandTotal = Math.max(calculatedSubtotal - customDiscount, 0);

    const customSubtotal = sanitizeWholeNumber(body.customSubtotal);
    const customGrandTotal = sanitizeWholeNumber(body.customGrandTotal);

    if (customSubtotal !== calculatedSubtotal || customGrandTotal !== calculatedGrandTotal) {
      return NextResponse.json(
        { ok: false, error: "Order totals are invalid. Please refresh and try again." },
        { status: 400 }
      );
    }

    const requestDetailsLines = [
      `Order Type: Custom Order`,
      `Title / Summary: ${customTitle}`,
      `Internal Remarks: ${internalRemarks || "None"}`,
      `Subtotal: RM${calculatedSubtotal}`,
      `Discount: RM${customDiscount}`,
      `Grand Total: RM${calculatedGrandTotal}`,
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
        internalRemarks: internalRemarks || null,
        customSubtotal: calculatedSubtotal,
        customDiscount,
        customGrandTotal: calculatedGrandTotal,
        totalAmount: calculatedGrandTotal,
        requestDetails: requestDetailsLines.join("\n"),
        customItems: {
          create: normalizedItems,
        },
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
