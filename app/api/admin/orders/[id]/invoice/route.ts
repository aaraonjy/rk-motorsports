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

function formatStoredList(value?: string | null) {
  if (!value) return "-";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
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
      },
    });

    if (!order) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
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
      bold = false
    ) => {
      page.drawText(text, {
        x,
        y: yPos,
        size,
        font: bold ? fontBold : fontRegular,
        color: rgb(0, 0, 0),
      });
    };

    // Logo
    let logoBottomY = height - 108;
    try {
      const logoPath = path.join(process.cwd(), "public", "Invoice Logo.png");
      const logoBytes = await fs.readFile(logoPath);
      const logoImage = await pdfDoc.embedPng(logoBytes);

      const scale = 180 / logoImage.width;
      const logoWidth = logoImage.width * scale;
      const logoHeight = logoImage.height * scale;

      logoBottomY = height - 56 - logoHeight + 6;

      page.drawImage(logoImage, {
        x: left,
        y: logoBottomY,
        width: logoWidth,
        height: logoHeight,
      });
    } catch {}

    // Move INVOICE lower again
    drawText("INVOICE", width - 140, height - 80, 18, true);

    y = Math.min(logoBottomY - 22, height - 160);

    drawText("34, Jalan Tembaga SD 5/2b,", left, y);
    y -= 14;
    drawText("Bandar Sri Damansara,", left, y);
    y -= 14;
    drawText("52200 Kuala Lumpur, Selangor", left, y);
    y -= 14;
    drawText("012-310 6132", left, y);

    y -= 30;
    page.drawLine({
      start: { x: left, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 20;
    drawText(`Invoice No: ${order.orderNumber}`, left, y, 10, true);
    drawText(`Date: ${formatDate(order.createdAt)}`, width - 170, y, 10, true);

    y -= 26;
    drawText("Bill To:", left, y, 12, true);
    y -= 16;
    drawText(order.user?.name || "-", left, y);
    y -= 14;
    drawText(order.user?.phone || "-", left, y);
    y -= 14;
    drawText(order.user?.email || "-", left, y);

    // Items section
    y -= 40;
    drawText("Items", left, y, 12, true);

    const headerY = y - 28;

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

    y = headerY - 20;

    // FULL DETAILS inside description
    const lines = [
      `Tuning Type: ${order.tuningType || "-"}`,
      `Brand: ${order.vehicleBrand || "-"}`,
      `Model / Generation: ${order.vehicleModel || "-"}`,
      `Engine / Variant: ${order.engineModel || "-"}`,
      `Year / Range: ${order.vehicleYear || "-"}`,
      `Capacity: ${order.engineCapacity ? order.engineCapacity + "cc" : "-"}`,
      `ECU Stage: ${order.ecuStage || "-"}`,
      `Turbo Setup: ${order.turboType || "-"}`,
      `Hardware Mods: ${formatStoredList(order.hardwareMods)}`,
      `ECU Type: ${order.ecuType || "-"}`,
      `ECU Read Tool: ${order.ecuReadTool || "-"}`,
      `Fuel Grade: ${order.fuelGrade || "-"}`,
      `Water Methanol Injection: ${order.waterMethanolInjection || "-"}`,
    ];

    for (const line of lines) {
      drawText(line, left + 8, y, 9);
      y -= 12;
    }

    drawText(formatMoney(order.totalAmount), width - 125, headerY - 20, 10);

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
    const fileSuffix = order.orderNumber.replace(/^RK-/, "");

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RK-INV-${fileSuffix}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
