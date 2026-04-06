// UPDATED: invoice route with spacing + label formatting fix

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

// import your label helpers
import {
  formatEcuStageLabel,
  formatTurboSetupLabel,
} from "@/lib/order-labels";

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

export async function GET(req, ctx) {
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
    let y = height - 56;

    const draw = (t, x, yPos, size = 10, isBold = false) => {
      page.drawText(t, {
        x,
        y: yPos,
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

    // move INVOICE slightly lower again
    draw("INVOICE", width - 140, height - 90, 18, true);

    // ===== ADDRESS (moved UP) =====
    y = logoBottomY - 10;

    draw("34, Jalan Tembaga SD 5/2b,", left, y);
    y -= 14;
    draw("Bandar Sri Damansara,", left, y);
    y -= 14;
    draw("52200 Kuala Lumpur, Selangor", left, y);
    y -= 14;
    draw("012-310 6132", left, y);

    y -= 25;

    page.drawLine({
      start: { x: left, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    y -= 18;

    draw(`Invoice No: ${order.orderNumber}`, left, y, 10, true);
    draw(`Date: ${formatDate(order.createdAt)}`, width - 170, y, 10, true);

    // ===== ITEMS (move UP) =====
    y -= 40;
    draw("Items", left, y, 12, true);

    const headerY = y - 22;

    page.drawRectangle({
      x: left,
      y: headerY,
      width: width - 100,
      height: 26,
      color: rgb(0.95, 0.95, 0.95),
    });

    draw("Description", left + 8, headerY + 8, 10, true);
    draw("Amount", width - 125, headerY + 8, 10, true);

    y = headerY - 20;

    // ===== DESCRIPTION WITH LABEL FIX =====
    const lines = [
      `Tuning Type: ${order.tuningType || "-"}`,
      `Brand: ${order.vehicleBrand || "-"}`,
      `Model / Generation: ${order.vehicleModel || "-"}`,
      `Engine / Variant: ${order.engineModel || "-"}`,
      `Year / Range: ${order.vehicleYear || "-"}`,
      `Capacity: ${order.engineCapacity ? order.engineCapacity + "cc" : "-"}`,
      `ECU Stage: ${formatEcuStageLabel(order.ecuStage)}`,
      `Turbo Setup: ${formatTurboSetupLabel(order.turboType)}`,
      `Hardware Mods: ${formatStoredList(order.hardwareMods)}`,
      `ECU Type: ${order.ecuType || "-"}`,
      `ECU Read Tool: ${order.ecuReadTool || "-"}`,
      `Fuel Grade: ${order.fuelGrade || "-"}`,
      `Water Methanol Injection: ${order.waterMethanolInjection || "-"}`,
    ];

    for (const line of lines) {
      draw(line, left + 8, y, 9);
      y -= 12;
    }

    draw(formatMoney(order.totalAmount), width - 125, headerY - 20, 10);

    const pdfBytes = await pdfDoc.save();
    const fileSuffix = order.orderNumber.replace(/^RK-/, "");

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RK-INV-${fileSuffix}.pdf`,
      },
    });
  } catch {
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
