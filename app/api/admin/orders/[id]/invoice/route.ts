import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { formatEcuStageLabel, formatTurboSetupLabel } from "@/lib/order-labels";

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-MY");
}

function formatMoney(value: number | string) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function formatStoredList(value?: string | null) {
  if (!value) return "-";
  return value.split(",").map(v => v.trim()).join(", ");
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
      include: { user: true },
    });

    if (!order) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const left = 50;
    const right = width - 50;

    const draw = (
      text: string,
      x: number,
      y: number,
      size = 10,
      isBold = false
    ) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: isBold ? bold : font,
        color: rgb(0, 0, 0),
      });
    };

    // ===== LOGO =====
    let logoBottomY = height - 100;

    try {
      const logoBytes = await fs.readFile(
        path.join(process.cwd(), "public", "Invoice Logo.png")
      );
      const img = await pdfDoc.embedPng(logoBytes);

      const scale = 160 / img.width;
      const w = img.width * scale;
      const h = img.height * scale;

      logoBottomY = height - 56 - h + 8;

      page.drawImage(img, {
        x: left,
        y: logoBottomY,
        width: w,
        height: h,
      });
    } catch {}

    // ===== TITLE =====
    const titleY = height - 84;
    draw("INVOICE", right - 95, titleY, 18, true);

    // ===== ADDRESS =====
    let y = logoBottomY - 26;

    draw("34, Jalan Tembaga SD 5/2b,", left, y);
    y -= 14;
    draw("Bandar Sri Damansara,", left, y);
    y -= 14;
    draw("52200 Kuala Lumpur, Selangor", left, y);
    y -= 14;
    draw("012-310 6132", left, y);

    y -= 28;

    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    // ===== HEADER INFO =====
    y -= 20;

    const rightAlignX = right - 94; // ✅ unified alignment

    draw(`Invoice No: ${order.orderNumber}`, left, y, 10, true);
    draw(`Date: ${formatDate(order.createdAt)}`, rightAlignX, y, 10, true);

    // ===== BILL TO =====
    y -= 28;
    draw("Bill To:", left, y, 12, true);
    y -= 16;
    draw(order.user?.name || "-", left, y);
    y -= 14;
    draw(order.user?.phone || "-", left, y);
    y -= 14;
    draw(order.user?.email || "-", left, y);

    // ===== ITEMS =====
    y -= 36;
    draw("Items", left, y, 12, true);

    const headerY = y - 34;

    page.drawRectangle({
      x: left,
      y: headerY,
      width: width - 100,
      height: 28,
      color: rgb(0.95, 0.95, 0.95),
      borderWidth: 0.5,
      borderColor: rgb(0.8, 0.8, 0.8),
    });

    draw("Description", left + 10, headerY + 9, 10, true);
    draw("Amount", rightAlignX, headerY + 9, 10, true); // ✅ aligned

    y = headerY - 26;

    const lines = [
      `Tuning Type: ${order.tuningType || "-"}`,
      `Brand: ${order.vehicleBrand || "-"}`,
      `Model / Generation: ${order.vehicleModel || "-"}`,
      `Engine / Variant: ${order.engineModel || "-"}`,
      `Year / Range: ${order.vehicleYear || "-"}`,
      `Capacity: ${order.engineCapacity ? order.engineCapacity + "cc" : "-"}`,
      `ECU Stage: ${formatEcuStageLabel(order.ecuStage) || "-"}`,
      `Turbo Setup: ${formatTurboSetupLabel(order.turboType) || "-"}`,
      `Hardware Mods: ${formatStoredList(order.hardwareMods)}`,
      `ECU Type: ${order.ecuType || "-"}`,
      `ECU Read Tool: ${order.ecuReadTool || "-"}`,
      `Fuel Grade: ${order.fuelGrade || "-"}`,
      `Water Methanol Injection: ${order.waterMethanolInjection || "-"}`,
    ];

    for (const line of lines) {
      draw(line, left + 10, y, 9);
      y -= 12;
    }

    draw(formatMoney(order.totalAmount), rightAlignX, headerY - 18, 10); // ✅ aligned

    // ===== TOTAL =====
    y -= 14;

    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 28;
    draw("Grand Total:", rightAlignX - 100, y, 12, true); // keep relative spacing
    draw(formatMoney(order.totalAmount), rightAlignX, y, 12, true); // ✅ aligned

    // ===== FOOTER =====
    y -= 54;
    draw("Thank you for your business.", left, y, 10);
    y -= 14;
    draw("We appreciate your support and trust in RK Motorsports.", left, y, 10);

    const pdfBytes = await pdfDoc.save();
    const fileSuffix = order.orderNumber.replace(/^RK-/, "");

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RK-INV-${fileSuffix}.pdf"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}