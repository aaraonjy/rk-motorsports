import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAuditLogFromRequest } from "@/lib/audit";
import { getAllOrders } from "@/lib/queries";
import { type OrderWithRelations } from "@/components/order-table";

type CsvTransactionRow = {
  date: Date;
  docNo: string;
  transactionType: "ORDER" | "CN";
  customer: string;
  customerEmail: string;
  customerPhone: string;
  orderType: string;
  titleSummary: string;
  tuningType: string;
  vehicleNo: string;
  status: string;
  referenceInvoiceNo: string;
  subtotal: number;
  discount: number;
  taxCode: string;
  taxAmount: number;
  grandTotal: number;
};

function getOrderTypeLabel(value?: string | null) {
  return value === "CUSTOM_ORDER" ? "Custom Order" : "Standard Tuning";
}

function getTuningTypeLabel(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") return "-";
  if (order.tuningType === "ECU_TCU") return "ECU + TCU";
  if (order.tuningType === "TCU") return "TCU";
  return "ECU";
}

function getOrderTitle(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customTitle || "Custom Order";
  }

  return order.selectedTuneLabel || `${getTuningTypeLabel(order)} Tune`;
}

function getOrderSubtotal(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return Number(order.customSubtotal ?? order.taxableSubtotal ?? order.totalAmount ?? 0);
  }

  return Number(order.taxableSubtotal ?? order.totalAmount ?? 0);
}

function getOrderDiscount(order: OrderWithRelations) {
  return Number(order.customDiscount ?? 0);
}

function getOrderTaxCode(order: OrderWithRelations) {
  return String(order.taxCode ?? order.taxDisplayLabel ?? "");
}

function getOrderTaxAmount(order: OrderWithRelations) {
  return Number(order.taxAmount ?? 0);
}

function getOrderGrandTotal(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return Number(order.grandTotalAfterTax ?? order.customGrandTotal ?? order.totalAmount ?? 0);
  }

  return Number(order.grandTotalAfterTax ?? order.totalAmount ?? 0);
}

function getReportDisplayStatus(order: OrderWithRelations) {
  const isAdminCreatedOrder = !!order.createdByAdminId;

  if (
    isAdminCreatedOrder &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED"
  ) {
    return "RECEIVED";
  }

  return order.status;
}

function getReportDisplayStatusLabel(order: OrderWithRelations) {
  return String(getReportDisplayStatus(order) || "").replace(/_/g, " ");
}

function getCreditNoteReasonLabel(value?: string | null) {
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

function formatCsvMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function escapeCsvValue(value: unknown) {
  const normalized = String(value ?? "");
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

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

function buildRows(
  orders: OrderWithRelations[],
  dateFrom?: string,
  dateTo?: string
): CsvTransactionRow[] {
  const rows: CsvTransactionRow[] = [];

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    if (isWithinDateRange(orderDate, dateFrom, dateTo)) {
      rows.push({
        date: orderDate,
        docNo: order.orderNumber,
        transactionType: "ORDER",
        customer: order.user?.name || "",
        customerEmail: order.user?.email || "",
        customerPhone: order.user?.phone || "",
        orderType: getOrderTypeLabel(order.orderType),
        titleSummary: getOrderTitle(order),
        tuningType: getTuningTypeLabel(order),
        vehicleNo: order.vehicleNo || "",
        status: getReportDisplayStatusLabel(order),
        referenceInvoiceNo: "",
        subtotal: getOrderSubtotal(order),
        discount: getOrderDiscount(order),
        taxCode: getOrderTaxCode(order),
        taxAmount: getOrderTaxAmount(order),
        grandTotal: getOrderGrandTotal(order),
      });
    }

    if (order.creditNote) {
      const cnDate = new Date(order.creditNote.cnDate);
      if (isWithinDateRange(cnDate, dateFrom, dateTo)) {
        rows.push({
          date: cnDate,
          docNo: order.creditNote.cnNo,
          transactionType: "CN",
          customer: order.user?.name || "",
          customerEmail: order.user?.email || "",
          customerPhone: order.user?.phone || "",
          orderType: getOrderTypeLabel(order.orderType),
          titleSummary: `Credit Note - ${getCreditNoteReasonLabel(order.creditNote.reasonType)}`,
          tuningType: getTuningTypeLabel(order),
          vehicleNo: order.vehicleNo || "",
          status: "Credit Note",
          referenceInvoiceNo: order.orderNumber,
          subtotal: -Math.abs(getOrderSubtotal(order)),
          discount: -Math.abs(getOrderDiscount(order)),
          taxCode: getOrderTaxCode(order),
          taxAmount: -Math.abs(getOrderTaxAmount(order)),
          grandTotal: -Math.abs(Number(order.creditNote.amount || getOrderGrandTotal(order))),
        });
      }
    }
  }

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function GET(req: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "You must be logged in." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Only admin can export this report." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status") || "ALL";
  const search = searchParams.get("search") || "";
  const customerKeyword = searchParams.get("customerKeyword") || "";
  const tuningType = searchParams.get("tuningType") || "ALL";
  const orderType = searchParams.get("orderType") || "ALL";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const result = (await getAllOrders({
    status,
    search,
    customerKeyword,
    tuningType,
    orderType,
    page: 1,
    pageSize: 10000,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const rows = buildRows(result.orders, dateFrom, dateTo);

  const csvRows = [
    [
      "Date",
      "Doc No.",
      "Transaction Type",
      "Customer",
      "Customer Email",
      "Customer Phone",
      "Order Type",
      "Title / Summary",
      "Tuning Type",
      "Vehicle No.",
      "Status",
      "Reference Invoice No.",
      "Subtotal",
      "Discount",
      "Tax Code",
      "Tax Amount",
      "Grand Total",
    ],
    ...rows.map((row) => [
      new Intl.DateTimeFormat("en-GB").format(row.date),
      row.docNo,
      row.transactionType,
      row.customer,
      row.customerEmail,
      row.customerPhone,
      row.orderType,
      row.titleSummary,
      row.tuningType,
      row.vehicleNo,
      row.status,
      row.referenceInvoiceNo,
      formatCsvMoney(row.subtotal),
      formatCsvMoney(row.discount),
      row.taxCode,
      formatCsvMoney(row.taxAmount),
      formatCsvMoney(row.grandTotal),
    ]),
  ];

  const csv = csvRows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  try {
    await createAuditLogFromRequest({
      req,
      user,
      module: "Reports",
      action: "EXPORT",
      entityType: "Report",
      entityCode: "Sales Report",
      description: `${user.name} exported Sales Report.`,
      newValues: { status, search, customerKeyword, tuningType, orderType, dateFrom, dateTo },
      status: "SUCCESS",
    });
  } catch (error) {
    console.error("Audit log creation failed:", error);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sales-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
