import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAuditLogFromRequest } from "@/lib/audit";
import { db } from "@/lib/db";

type TaxCsvRow = {
  date: Date;
  docNo: string;
  transactionType: "CS" | "INV" | "CN";
  referenceInvoiceNo: string;
  customerName: string;
  itemDescription: string;
  qty: number;
  unitPrice: number;
  taxableAmount: number;
  taxCode: string;
  taxRate: number;
  taxAmount: number;
};

function isWithinDateRange(value: Date, dateFrom?: string, dateTo?: string) {
  const time = value.getTime();

  if (dateFrom) {
    const start = new Date(dateFrom);
    if (!Number.isNaN(start.getTime()) && time < start.getTime()) return false;
  }

  if (dateTo) {
    const end = new Date(dateTo);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (time > end.getTime()) return false;
    }
  }

  return true;
}

function formatCsvDate(value: Date) {
  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatCsvMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function escapeCsvValue(value: unknown) {
  const normalized = String(value ?? "");
  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function getInvoiceTransactionType(order: any): "CS" | "INV" {
  return order?.docType === "CS" ? "CS" : "INV";
}

function getOrderLineItemTaxRows(order: any): TaxCsvRow[] {
  const orderDate = new Date(order.documentDate ?? order.createdAt);
  const rows: TaxCsvRow[] = [];

  const hasLineItemTax = Array.isArray(order.customItems) && order.customItems.some(
    (item: any) => Boolean(item.taxCode) && Number(item.taxAmount ?? 0) > 0
  );

  if (hasLineItemTax) {
    for (const item of order.customItems) {
      const taxAmount = Number(item.taxAmount ?? 0);
      const taxCode = String(item.taxCode ?? "").trim();
      if (!taxCode || taxAmount <= 0) continue;

      rows.push({
        date: orderDate,
        docNo: order.orderNumber,
        transactionType: getInvoiceTransactionType(order),
        referenceInvoiceNo: "-",
        customerName: order.user?.name || "-",
        itemDescription: item.description || "-",
        qty: Number(item.qty ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        taxableAmount: Number(item.lineTotal ?? 0),
        taxCode,
        taxRate: Number(item.taxRate ?? 0),
        taxAmount,
      });
    }
    return rows;
  }

  const orderTaxAmount = Number(order.taxAmount ?? 0);
  const orderTaxCode = String(order.taxCode ?? "").trim();

  if (orderTaxCode && orderTaxAmount > 0) {
    rows.push({
      date: orderDate,
      docNo: order.orderNumber,
      transactionType: getInvoiceTransactionType(order),
      referenceInvoiceNo: "-",
      customerName: order.user?.name || "-",
      itemDescription: order.customTitle || order.selectedTuneLabel || "Order Tax",
      qty: 1,
      unitPrice: Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0),
      taxableAmount: Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0),
      taxCode: orderTaxCode,
      taxRate: Number(order.taxRate ?? 0),
      taxAmount: orderTaxAmount,
    });
  }

  return rows;
}

function getCreditNoteTaxRows(order: any): TaxCsvRow[] {
  if (!order.creditNote) return [];

  const cnDate = new Date(order.creditNote.cnDate);
  const rows: TaxCsvRow[] = [];

  const hasLineItemTax = Array.isArray(order.customItems) && order.customItems.some(
    (item: any) => Boolean(item.taxCode) && Number(item.taxAmount ?? 0) > 0
  );

  if (hasLineItemTax) {
    for (const item of order.customItems) {
      const taxAmount = Number(item.taxAmount ?? 0);
      const taxCode = String(item.taxCode ?? "").trim();
      if (!taxCode || taxAmount <= 0) continue;

      rows.push({
        date: cnDate,
        docNo: order.creditNote.cnNo,
        transactionType: "CN",
        referenceInvoiceNo: order.orderNumber,
        customerName: order.user?.name || "-",
        itemDescription: item.description || "-",
        qty: Number(item.qty ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        taxableAmount: -Math.abs(Number(item.lineTotal ?? 0)),
        taxCode,
        taxRate: Number(item.taxRate ?? 0),
        taxAmount: -Math.abs(taxAmount),
      });
    }
    return rows;
  }

  const orderTaxAmount = Number(order.taxAmount ?? 0);
  const orderTaxCode = String(order.taxCode ?? "").trim();

  if (orderTaxCode && orderTaxAmount > 0) {
    rows.push({
      date: cnDate,
      docNo: order.creditNote.cnNo,
      transactionType: "CN",
      referenceInvoiceNo: order.orderNumber,
      customerName: order.user?.name || "-",
      itemDescription: order.customTitle || order.selectedTuneLabel || "Credit Note Tax Reversal",
      qty: 1,
      unitPrice: Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0),
      taxableAmount: -Math.abs(Number(order.taxableSubtotal ?? order.customSubtotal ?? order.totalAmount ?? 0)),
      taxCode: orderTaxCode,
      taxRate: Number(order.taxRate ?? 0),
      taxAmount: -Math.abs(orderTaxAmount),
    });
  }

  return rows;
}

export async function GET(req: Request) {
  const user = await getSessionUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const taxCode = url.searchParams.get("taxCode") || "ALL";
  const transactionType = url.searchParams.get("transactionType") || "ALL";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const orders = await db.order.findMany({
    where: {
      OR: [
        { taxAmount: { gt: 0 } },
        {
          customItems: {
            some: {
              taxAmount: { gt: 0 },
            },
          },
        },
        {
          creditNote: {
            isNot: null,
          },
        },
      ],
    },
    include: {
      user: {
        select: {
          name: true,
        },
      },
      customItems: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          description: true,
          qty: true,
          unitPrice: true,
          lineTotal: true,
          taxCode: true,
          taxRate: true,
          taxAmount: true,
        },
      },
      creditNote: {
        select: {
          id: true,
          cnNo: true,
          cnDate: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: TaxCsvRow[] = [];

  for (const order of orders) {
    const combinedRows = [...getOrderLineItemTaxRows(order), ...getCreditNoteTaxRows(order)];

    for (const row of combinedRows) {
      if (!isWithinDateRange(row.date, dateFrom, dateTo)) continue;
      if (taxCode !== "ALL" && row.taxCode !== taxCode) continue;
      if (transactionType !== "ALL" && row.transactionType !== transactionType) continue;
      rows.push(row);
    }
  }

  rows.sort((a, b) => {
    const dateDiff = b.date.getTime() - a.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.docNo.localeCompare(b.docNo);
  });

  const headers = [
    "Date",
    "Doc No",
    "Type",
    "Reference Invoice",
    "Customer",
    "Item Description",
    "Qty",
    "Unit Price",
    "Taxable Amount",
    "Tax Code",
    "Tax Rate",
    "Tax Amount",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(formatCsvDate(row.date)),
        escapeCsvValue(row.docNo),
        escapeCsvValue(row.transactionType),
        escapeCsvValue(row.referenceInvoiceNo),
        escapeCsvValue(row.customerName),
        escapeCsvValue(row.itemDescription),
        escapeCsvValue(row.qty),
        escapeCsvValue(formatCsvMoney(row.unitPrice)),
        escapeCsvValue(formatCsvMoney(row.taxableAmount)),
        escapeCsvValue(row.taxCode),
        escapeCsvValue(`${row.taxRate.toFixed(2)}%`),
        escapeCsvValue(formatCsvMoney(row.taxAmount)),
      ].join(",")
    ),
  ];

  const csv = lines.join("\n");

  try {
    await createAuditLogFromRequest({
      req,
      user,
      module: "Reports",
      action: "EXPORT",
      entityType: "TaxReport",
      description: "Exported Tax Report CSV.",
      newValues: {
        taxCode,
        transactionType,
        dateFrom,
        dateTo,
        rowCount: rows.length,
      },
      status: "SUCCESS",
    });
  } catch (error) {
    console.error("Tax report audit log failed:", error);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tax-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
