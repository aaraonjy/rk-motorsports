import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-MY");
}

function formatMoney(value: number | string) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

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

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const left = 50;
    let y = height - 56;

    const drawText = (
      text: string,
      x: number,
      yPos: number,
      size = 10,
      bold = false,
      color = rgb(0, 0, 0)
    ) => {
      page.drawText(text, {
        x,
        y: yPos,
        size,
        font: bold ? fontBold : fontRegular,
        color,
      });
    };

    // Header row: smaller logo left, invoice title right
    let logoBottomY = height - 108;
    try {
      const logoPath = path.join(process.cwd(), "public", "Invoice Logo.png");
      const logoBytes = await fs.readFile(logoPath);
      const logoImage = await pdfDoc.embedPng(logoBytes);

      const targetWidth = 180;
      const scale = targetWidth / logoImage.width;
      const logoWidth = logoImage.width * scale;
      const logoHeight = logoImage.height * scale;

      logoBottomY = height - 56 - logoHeight + 6;

      page.drawImage(logoImage, {
        x: left,
        y: logoBottomY,
        width: logoWidth,
        height: logoHeight,
      });
    } catch (logoError) {
      console.error("Invoice logo load failed:", logoError);
    }

    drawText("INVOICE", width - 140, height - 56, 18, true);

    // Company address block below header row
    y = Math.min(logoBottomY - 22, height - 160);
    drawText("34, Jalan Tembaga SD 5/2b,", left, y);
    y -= 14;
    drawText("Bandar Sri Damansara,", left, y);
    y -= 14;
    drawText("52200 Kuala Lumpur, Selangor", left, y);
    y -= 14;
    drawText("012-310 6132", left, y);

    y -= 34;
    page.drawLine({
      start: { x: left, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 24;
    drawText(`Invoice No: ${order.orderNumber}`, left, y, 10, true);
    drawText(`Date: ${formatDate(order.createdAt)}`, width - 170, y, 10, true);

    y -= 28;
    drawText("Bill To:", left, y, 12, true);
    y -= 16;
    drawText(order.user?.name || "-", left, y);
    y -= 14;
    drawText(order.user?.phone || "-", left, y);
    y -= 14;
    drawText(order.user?.email || "-", left, y);

    y -= 28;
    drawText("Order Information", left, y, 12, true);
    y -= 18;
    drawText(`Order Number: ${order.orderNumber}`, left, y);
    y -= 14;
    drawText(`Tuning Type: ${order.tuningType || "ECU"}`, left, y);
    y -= 14;
    drawText(
      `Vehicle: ${order.vehicleBrand || "-"} ${order.vehicleModel || "-"}`,
      left,
      y
    );
    y -= 14;
    drawText(`ECU Stage: ${order.ecuStage || "-"}`, left, y);
    y -= 14;
    drawText(`TCU Stage: ${order.tcuStage || "-"}`, left, y);

    // Items heading with more spacing above table
    y -= 48;
    drawText("Items", left, y, 12, true);

    const headerY = y - 26;
    page.drawRectangle({
      x: left,
      y: headerY,
      width: width - 100,
      height: 26,
      color: rgb(0.95, 0.95, 0.95),
      borderWidth: 0.5,
      borderColor: rgb(0.8, 0.8, 0.8),
    });

    drawText("Description", left + 8, headerY + 8, 10, true);
    drawText("Amount", width - 125, headerY + 8, 10, true);

    y = headerY - 28;

    if (order.items.length > 0) {
      for (const item of order.items) {
        const title = item.product?.title || "Tuning Service";
        drawText(title, left + 8, y, 10);
        drawText(formatMoney(item.price), width - 125, y, 10);
        y -= 18;
      }
    } else {
      drawText("Tuning Service", left + 8, y, 10);
      drawText(formatMoney(order.totalAmount), width - 125, y, 10);
      y -= 18;
    }

    y -= 10;
    page.drawLine({
      start: { x: left, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 24;
    drawText("Total:", width - 180, y, 12, true);
    drawText(formatMoney(order.totalAmount), width - 125, y, 12, true);

    y -= 50;
    drawText("Thank you for your business.", left, y, 10);

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
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
