import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAYSIA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(value: unknown) {
  return `RM ${Number(value || 0).toFixed(2)}`;
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

function formatReasonLabel(value?: string | null) {
  switch (value) {
    case "CUSTOMER_CANCEL_ORDER":
      return "Customer Cancel Order";
    case "PRICING_CORRECTION":
      return "Pricing Correction";
    case "OVERCHARGE_ADJUSTMENT":
      return "Overcharge Adjustment";
    case "DUPLICATE_INVOICE":
      return "Duplicate Invoice";
    case "SERVICE_NOT_PROCEEDED":
      return "Service Not Proceeded";
    case "OTHER":
      return "Other";
    default:
      return value || "-";
  }
}

async function drawHeader(params: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  left: number;
  right: number;
  height: number;
  cnNo: string;
  cnDate: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}) {
  const { pdfDoc, page, font, bold, left, right, height, cnNo, cnDate, customerName, customerPhone, customerEmail } = params;
  const rightColumnX = right - 120;
  let logoBottomY = height - 100;

  await fs
    .readFile(path.join(process.cwd(), "public", "Invoice Logo.png"))
    .then(async (logoBytes) => {
      const img = await pdfDoc.embedPng(logoBytes);
      const scale = 160 / img.width;
      const w = img.width * scale;
      const h = img.height * scale;
      logoBottomY = height - 56 - h + 8;
      page.drawImage(img, { x: left, y: logoBottomY, width: w, height: h });
    })
    .catch(() => {});

  const titleY = height - 84;
  drawText(page, font, bold, "CREDIT NOTE", rightColumnX, titleY, 18, true);

  let y = logoBottomY - 26;
  drawText(page, font, bold, "34, Jalan Tembaga SD 5/2b,", left, y);
  y -= 14;
  drawText(page, font, bold, "Bandar Sri Damansara,", left, y);
  y -= 14;
  drawText(page, font, bold, "52200 Kuala Lumpur, Selangor", left, y);
  y -= 14;
  drawText(page, font, bold, "012-310 6132", left, y);

  y -= 28;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });

  y -= 20;
  drawText(page, font, bold, `Credit Note No: ${cnNo}`, left, y, 10, true);
  drawText(page, font, bold, `Date: ${formatDate(cnDate)}`, rightColumnX, y, 10, true);

  y -= 28;
  drawText(page, font, bold, "Bill To:", left, y, 12, true);
  y -= 16;
  drawText(page, font, bold, customerName || "-", left, y);
  y -= 14;
  drawText(page, font, bold, customerPhone || "-", left, y);
  y -= 14;
  drawText(page, font, bold, customerEmail || "-", left, y);

  return { y, rightColumnX };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const creditNote = await db.creditNote.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { createdAt: "asc" } },
        order: true,
      },
    });

    if (!creditNote) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();
    const left = 50;
    const right = width - 50;

    const { y: headerStartY } = await drawHeader({
      pdfDoc,
      page,
      font,
      bold,
      left,
      right,
      height,
      cnNo: creditNote.cnNo,
      cnDate: creditNote.cnDate,
      customerName: creditNote.customer?.name,
      customerPhone: creditNote.customer?.phone,
      customerEmail: creditNote.customer?.email,
    });

    let y = headerStartY - 40;
    drawText(page, font, bold, `Reference Invoice No: ${creditNote.referenceOrderNumber}`, left, y, 10, true);
    y -= 16;
    drawText(page, font, bold, `Reason: ${formatReasonLabel(creditNote.reasonType)}`, left, y, 10, true);
    if (creditNote.reasonRemarks) {
      y -= 14;
      const remarkLines = wrapText(`Remarks: ${creditNote.reasonRemarks}`, 75);
      for (const line of remarkLines) {
        drawText(page, font, bold, line, left, y, 9);
        y -= 12;
      }
    }

    y -= 24;
    page.drawRectangle({ x: left, y, width: width - 100, height: 28, color: rgb(0.95, 0.95, 0.95), borderWidth: 0.5, borderColor: rgb(0.8, 0.8, 0.8) });
    drawText(page, font, bold, "Description", left + 10, y + 9, 10, true);
    drawText(page, font, bold, "Qty", right - 215, y + 9, 10, true);
    drawText(page, font, bold, "Unit Price", right - 155, y + 9, 10, true);
    drawText(page, font, bold, "Total", right - 80, y + 9, 10, true);

    y -= 24;
    for (const item of creditNote.items) {
      const lines = wrapText(item.description, 42);
      drawText(page, font, bold, lines[0], left + 10, y, 9);
      if (lines[1]) drawText(page, font, bold, lines[1], left + 10, y - 10, 9);
      drawText(page, font, bold, String(item.qty), right - 215, y, 9);
      drawText(page, font, bold, formatMoney(item.unitPrice), right - 155, y, 9);
      drawText(page, font, bold, formatMoney(item.lineTotal), right - 80, y, 9);
      y -= lines[1] ? 32 : 22;
    }

    y -= 8;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    y -= 28;
    const totalLabelX = right - 165;
    const totalValueX = right - 80;
    drawText(page, font, bold, "Total:", totalLabelX, y, 12, true);
    drawText(page, font, bold, `- ${formatMoney(creditNote.amount)}`, totalValueX, y, 12, true);

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${creditNote.cnNo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Credit Note generation failed:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
