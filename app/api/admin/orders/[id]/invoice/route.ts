import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import PDFDocument from "pdfkit";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await ctx.params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        user: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => {
      buffers.push(chunk);
    });

    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);
    });

    doc.fontSize(20).text("RK MOTORSPORTS", { align: "left" });
    doc
      .fontSize(10)
      .text("34, Jalan Tembaga SD 5/2b,")
      .text("Bandar Sri Damansara,")
      .text("52200 Kuala Lumpur, Selangor")
      .text("012-310 6132");

    doc.moveDown();
    doc.fontSize(16).text("INVOICE", { align: "right" });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Invoice No: RK-${order.orderNumber}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);

    doc.moveDown();

    doc.fontSize(12).text("Bill To:");
    doc.fontSize(10);
    doc.text(order.user?.name || "-");
    doc.text(order.user?.phone || "-");
    doc.text(order.user?.email || "-");

    doc.moveDown();

    doc.fontSize(12).text("Order Details:");
    doc.moveDown(0.5);

    doc.fontSize(10);
    doc.text(`Vehicle: ${order.vehicleBrand || "-"} ${order.vehicleModel || "-"}`);
    doc.text(`Stage: ${order.ecuStage || order.tcuStage || "-"}`);
    doc.text(`Tuning Type: ${order.tuningType || "ECU"}`);

    doc.moveDown();

    doc.fontSize(12).text("Items:");
    doc.moveDown(0.5);

    if (order.items.length > 0) {
      order.items.forEach((item, index) => {
        doc
          .fontSize(10)
          .text(`${index + 1}. ${item.product.title} - RM ${Number(item.price).toFixed(2)}`);
      });
    } else {
      doc.fontSize(10).text("1. Tuning Service");
    }

    doc.moveDown();

    doc.fontSize(14).text(`Total: RM ${Number(order.totalAmount).toFixed(2)}`, {
      align: "right",
    });

    doc.end();

    const pdfBuffer = await pdfBufferPromise;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RK-Invoice-${order.orderNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Invoice generation failed:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}