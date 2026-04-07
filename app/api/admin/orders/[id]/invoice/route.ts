import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import {
  formatCurrentEcuSetupLabel,
  formatEcuStageLabel,
  formatTcuStageLabel,
  formatTurboSetupLabel,
} from "@/lib/order-labels";

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-MY");
}

function formatMoney(value: number | string | null | undefined) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function formatStoredList(value?: string | null) {
  if (!value) return "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function isPresent(value?: string | null | number) {
  return !!String(value ?? "").trim();
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 10,
  isBold = false
) {
  page.drawText(text, {
    x,
    y,
    size,
    font: isBold ? bold : font,
    color: rgb(0, 0, 0),
  });
}

function wrapText(text: string, maxChars = 62) {
  const normalized = String(text || "").trim();
  if (!normalized) return ["-"];

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["-"];
}

function drawInvoiceHeader(params: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  left: number;
  right: number;
  height: number;
  orderNumber: string;
  invoiceDate: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}) {
  const { pdfDoc, page, font, bold, left, right, height, orderNumber, invoiceDate, customerName, customerPhone, customerEmail } = params;
  const rightColumnX = right - 80;

  let logoBottomY = height - 100;

  return fs
    .readFile(path.join(process.cwd(), "public", "Invoice Logo.png"))
    .then(async (logoBytes) => {
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
    })
    .catch(() => {
      // keep invoice generation working even if logo is missing
    })
    .then(() => {
      const titleY = height - 84;
      drawText(page, font, bold, "INVOICE", rightColumnX, titleY, 18, true);

      let y = logoBottomY - 26;
      drawText(page, font, bold, "34, Jalan Tembaga SD 5/2b,", left, y);
      y -= 14;
      drawText(page, font, bold, "Bandar Sri Damansara,", left, y);
      y -= 14;
      drawText(page, font, bold, "52200 Kuala Lumpur, Selangor", left, y);
      y -= 14;
      drawText(page, font, bold, "012-310 6132", left, y);

      y -= 28;

      page.drawLine({
        start: { x: left, y },
        end: { x: right, y },
        thickness: 1,
        color: rgb(0.85, 0.85, 0.85),
      });

      y -= 20;
      drawText(page, font, bold, `Invoice No: ${orderNumber}`, left, y, 10, true);
      drawText(page, font, bold, `Date: ${formatDate(invoiceDate)}`, rightColumnX, y, 10, true);

      y -= 28;
      drawText(page, font, bold, "Bill To:", left, y, 12, true);
      y -= 16;
      drawText(page, font, bold, customerName || "-", left, y);
      y -= 14;
      drawText(page, font, bold, customerPhone || "-", left, y);
      y -= 14;
      drawText(page, font, bold, customerEmail || "-", left, y);

      return { y, rightColumnX };
    });
}

function buildStandardLines(order: {
  tuningType?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  engineModel?: string | null;
  vehicleYear?: string | null;
  engineCapacity?: string | null;
  ecuStage?: string | null;
  currentEcuSetupStage?: string | null;
  turboType?: string | null;
  turboSpec?: string | null;
  hardwareMods?: string | null;
  fuelSystemMods?: string | null;
  engineMods?: string | null;
  engineModsOther?: string | null;
  additionalDetails?: string | null;
  ecuType?: string | null;
  ecuReadTool?: string | null;
  fuelGrade?: string | null;
  waterMethanolInjection?: string | null;
  tcuStage?: string | null;
  tcuType?: string | null;
  tcuReadTool?: string | null;
  tcuVersion?: string | null;
}) {
  const lines: string[] = [];

  if (isPresent(order.tuningType)) {
    lines.push(`Tuning Type: ${order.tuningType === "ECU_TCU" ? "ECU + TCU" : order.tuningType}`);
  }
  if (isPresent(order.vehicleBrand)) lines.push(`Brand: ${order.vehicleBrand}`);
  if (isPresent(order.vehicleModel)) lines.push(`Model / Generation: ${order.vehicleModel}`);
  if (isPresent(order.engineModel)) lines.push(`Engine / Variant: ${order.engineModel}`);
  if (isPresent(order.vehicleYear)) lines.push(`Year / Range: ${order.vehicleYear}`);
  if (isPresent(order.engineCapacity)) lines.push(`Capacity: ${order.engineCapacity}cc`);

  if (order.tuningType === "ECU" || order.tuningType === "ECU_TCU" || !order.tuningType) {
    if (isPresent(order.ecuStage)) {
      lines.push(`ECU Stage: ${formatEcuStageLabel(order.ecuStage) || order.ecuStage}`);
    }
    if (isPresent(order.currentEcuSetupStage)) {
      lines.push(
        `Current ECU Setup: ${
          formatCurrentEcuSetupLabel(order.currentEcuSetupStage) || order.currentEcuSetupStage
        }`
      );
    }
    if (isPresent(order.turboType)) {
      const turboLabel = formatTurboSetupLabel(order.turboType) || order.turboType;
      const turboValue = isPresent(order.turboSpec) ? `${turboLabel} (${order.turboSpec})` : turboLabel;
      lines.push(`Turbo Setup: ${turboValue}`);
    }
    if (isPresent(order.hardwareMods)) lines.push(`Hardware Mods: ${formatStoredList(order.hardwareMods)}`);
    if (isPresent(order.fuelSystemMods)) lines.push(`Fuel System: ${formatStoredList(order.fuelSystemMods)}`);
    if (isPresent(order.engineMods)) lines.push(`Engine Mods: ${formatStoredList(order.engineMods)}`);
    if (isPresent(order.engineModsOther)) lines.push(`Other Engine Mods: ${order.engineModsOther}`);
    if (isPresent(order.additionalDetails)) lines.push(`Additional Details: ${order.additionalDetails}`);
    if (isPresent(order.ecuType)) lines.push(`ECU Type: ${order.ecuType}`);
    if (isPresent(order.ecuReadTool)) lines.push(`ECU Read Tool: ${order.ecuReadTool}`);
    if (isPresent(order.fuelGrade)) lines.push(`Fuel Grade: ${order.fuelGrade}`);
    if (isPresent(order.waterMethanolInjection) && order.waterMethanolInjection !== "Not selected") {
      lines.push(`Water Methanol Injection: ${order.waterMethanolInjection}`);
    }
  }

  if (order.tuningType === "TCU" || order.tuningType === "ECU_TCU") {
    if (isPresent(order.tcuStage)) lines.push(`TCU Stage: ${formatTcuStageLabel(order.tcuStage) || order.tcuStage}`);
    if (isPresent(order.tcuType)) lines.push(`TCU Type: ${order.tcuType}`);
    if (isPresent(order.tcuReadTool)) lines.push(`TCU Read Tool: ${order.tcuReadTool}`);
    if (isPresent(order.tcuVersion)) lines.push(`TCU Version: ${order.tcuVersion}`);
  }

  return lines;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        user: true,
        customItems: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const isAdmin = user.role === "ADMIN";
    const isOwner = order.userId === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const left = 50;
    const right = width - 50;

    const { y: headerStartY, rightColumnX } = await drawInvoiceHeader({
      pdfDoc,
      page,
      font,
      bold,
      left,
      right,
      height,
      orderNumber: order.orderNumber,
      invoiceDate: order.createdAt,
      customerName: order.user?.name,
      customerPhone: order.user?.phone,
      customerEmail: order.user?.email,
    });

    const isCustomOrder = order.orderType === "CUSTOM_ORDER";
    const headerY = headerStartY - 62;

    page.drawRectangle({
      x: left,
      y: headerY,
      width: width - 100,
      height: 28,
      color: rgb(0.95, 0.95, 0.95),
      borderWidth: 0.5,
      borderColor: rgb(0.8, 0.8, 0.8),
    });

    if (isCustomOrder) {
      const descX = left + 10;
      const qtyX = right - 220;
      const unitX = right - 155;
      const totalX = right - 80;

      drawText(page, font, bold, "Description", descX, headerY + 9, 10, true);
      drawText(page, font, bold, "Qty", qtyX, headerY + 9, 10, true);
      drawText(page, font, bold, "Unit Price", unitX, headerY + 9, 10, true);
      drawText(page, font, bold, "Total", totalX, headerY + 9, 10, true);

      let y = headerY - 24;
      const rowHeight = 22;

      const titleLines = wrapText(order.customTitle || "-", 58);
      for (const line of titleLines) {
        drawText(page, font, bold, line, descX, y, 9, false);
        y -= 11;
      }
      drawText(page, font, bold, "1", qtyX, headerY - 18, 9);
      drawText(page, font, bold, formatMoney(order.customGrandTotal ?? order.totalAmount), unitX, headerY - 18, 9);
      drawText(page, font, bold, formatMoney(order.customGrandTotal ?? order.totalAmount), totalX, headerY - 18, 9);

      y -= 8;

      if (order.customItems.length > 0) {
        y -= 10;
        drawText(page, font, bold, "Item Breakdown", descX, y, 10, true);
        y -= 14;

        for (const item of order.customItems) {
          if (y < 120) break;
          const itemLines = wrapText(item.description, 48);
          drawText(page, font, bold, itemLines[0], descX + 8, y, 9);
          if (itemLines[1]) {
            drawText(page, font, bold, itemLines[1], descX + 8, y - 10, 9);
          }
          drawText(page, font, bold, String(item.qty), qtyX, y, 9);
          drawText(page, font, bold, formatMoney(item.unitPrice), unitX, y, 9);
          drawText(page, font, bold, formatMoney(item.lineTotal), totalX, y, 9);
          y -= itemLines.length > 1 ? rowHeight + 10 : rowHeight;
        }
      }

      y -= 8;
      page.drawLine({
        start: { x: left, y },
        end: { x: right, y },
        thickness: 1,
        color: rgb(0.85, 0.85, 0.85),
      });

      y -= 22;
      drawText(page, font, bold, "Subtotal:", rightColumnX - 110, y, 10, true);
      drawText(page, font, bold, formatMoney(order.customSubtotal ?? order.totalAmount), rightColumnX, y, 10);

      y -= 18;
      drawText(page, font, bold, "Discount:", rightColumnX - 110, y, 10, true);
      drawText(page, font, bold, formatMoney(order.customDiscount ?? 0), rightColumnX, y, 10);

      y -= 24;
      drawText(page, font, bold, "Grand Total:", rightColumnX - 110, y, 12, true);
      drawText(page, font, bold, formatMoney(order.customGrandTotal ?? order.totalAmount), rightColumnX, y, 12, true);

      if (isPresent(order.internalRemarks)) {
        y -= 40;
        drawText(page, font, bold, "Remarks:", left, y, 10, true);
        y -= 14;
        for (const line of wrapText(order.internalRemarks || "", 82)) {
          drawText(page, font, bold, line, left, y, 9);
          y -= 11;
        }
      }

      y -= 28;
      drawText(page, font, bold, "Thank you for your business.", left, y, 10);
      y -= 14;
      drawText(page, font, bold, "We appreciate your support and trust in RK Motorsports.", left, y, 10);
    } else {
      drawText(page, font, bold, "Description", left + 10, headerY + 9, 10, true);
      drawText(page, font, bold, "Amount", rightColumnX, headerY + 9, 10, true);

      let y = headerY - 26;
      const lines = buildStandardLines(order);

      for (const line of lines) {
        drawText(page, font, bold, line, left + 10, y, 9);
        y -= 12;
      }

      drawText(page, font, bold, formatMoney(order.totalAmount), rightColumnX, headerY - 18, 10);

      y -= 14;
      page.drawLine({
        start: { x: left, y },
        end: { x: right, y },
        thickness: 1,
        color: rgb(0.85, 0.85, 0.85),
      });

      y -= 28;
      drawText(page, font, bold, "Grand Total:", rightColumnX - 110, y, 12, true);
      drawText(page, font, bold, formatMoney(order.totalAmount), rightColumnX, y, 12, true);

      y -= 54;
      drawText(page, font, bold, "Thank you for your business.", left, y, 10);
      y -= 14;
      drawText(page, font, bold, "We appreciate your support and trust in RK Motorsports.", left, y, 10);
    }

    const pdfBytes = await pdfDoc.save();
    const fileSuffix = order.orderNumber.replace(/^RK-/, "");

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="RK-INV-${fileSuffix}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Invoice generation failed:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
