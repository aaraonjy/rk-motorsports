import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type CustomOrderItemPayload = {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

type UpdateCustomOrderPayload = {
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
    const body = (await req.json()) as UpdateCustomOrderPayload;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        customItems: true,
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

    const customerId = String(body.customerId || "").trim();
    const customTitle = String(body.customTitle || "").trim();
    const internalRemarks = String(body.internalRemarks || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

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

    await db.$transaction(async (tx) => {
      await tx.customOrderItem.deleteMany({
        where: { orderId: order.id },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
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
    });

    return NextResponse.json({
      ok: true,
      redirectTo: "/admin",
    });
  } catch (error) {
    console.error("PUT /api/admin/orders/[id] failed:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to update custom order right now." },
      { status: 500 }
    );
  }
}
