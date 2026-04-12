import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { type OrderWithRelations } from "@/components/order-table";

function getOrderAmount(order: OrderWithRelations) {
  return Number(order.customGrandTotal ?? order.totalAmount ?? 0);
}

function getOrderOutstandingBalance(order: OrderWithRelations) {
  const grandTotal = getOrderAmount(order);
  const outstanding = Number(order.outstandingBalance ?? Math.max(grandTotal - Number(order.totalPaid ?? 0), 0));
  return Math.max(Number(outstanding), 0);
}

function getPaymentStatusLabel(order: OrderWithRelations) {
  const totalPaid = Number(order.totalPaid ?? 0);
  const outstandingBalance = getOrderOutstandingBalance(order);

  if (order.status === "COMPLETED") return "Completed";
  if (order.status === "CANCELLED") return "Cancelled";
  if (outstandingBalance === 0) return "Paid";
  if (totalPaid > 0) return "Partially Paid";
  return "Unpaid";
}

function getReportDisplayStatusLabel(order: OrderWithRelations) {
  switch (order.status) {
    case "FILE_RECEIVED":
      return "Received";
    case "IN_PROGRESS":
      return "In Progress";
    case "AWAITING_PAYMENT":
      return "Pending Payment";
    case "READY_FOR_DOWNLOAD":
      return "Ready for Download";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PAID":
      return "Paid";
    default:
      return String(order.status || "").replace(/_/g, " ");
  }
}

function getPaymentModeLabel(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();

  switch (normalized) {
    case "CASH":
      return "Cash";
    case "BANK_TRANSFER":
      return "Bank Transfer";
    case "CARD":
    case "CARD_PAYMENT":
      return "Card Payment";
    case "QR":
    case "QR_PAYMENT":
      return "QR Payment";
    default:
      return String(value || "").trim() || "Other";
  }
}

function getPaymentBreakdown(order: OrderWithRelations) {
  const payments = order.payments || [];
  if (payments.length === 0) return "";

  const grouped = new Map<string, number>();

  for (const payment of payments) {
    const key = getPaymentModeLabel(payment.paymentMode);
    grouped.set(key, (grouped.get(key) || 0) + Number(payment.amount || 0));
  }

  return Array.from(grouped.entries())
    .map(([mode, amount]) => `${mode}: ${amount}`)
    .join(" | ");
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

export async function GET(req: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "You must be logged in." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Only admin can export this report." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  const search = searchParams.get("search") || "";
  const customerKeyword = searchParams.get("customerKeyword") || "";
  const status = searchParams.get("status") || "ALL";
  const paymentStatus = searchParams.get("paymentStatus") || "ALL";
  const balanceType = searchParams.get("balanceType") || "ALL";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const outstandingOnly = balanceType === "OUTSTANDING";

  const result = (await getAllOrders({
    search,
    customerKeyword,
    status,
    paymentStatus,
    outstandingOnly,
    orderType: "CUSTOM_ORDER",
    dateFrom,
    dateTo,
    page: 1,
    pageSize: 10000,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const filteredOrders =
    balanceType === "PAID"
      ? result.orders.filter((order) => getOrderOutstandingBalance(order) === 0)
      : result.orders;

  const rows = [
    [
      "Date",
      "Order No.",
      "Customer",
      "Customer Email",
      "Customer Phone",
      "Vehicle No.",
      "Order Status",
      "Grand Total",
      "Total Paid",
      "Outstanding Balance",
      "Payment Status",
      "Payment Breakdown",
    ],
    ...filteredOrders.map((order) => [
      new Intl.DateTimeFormat("en-GB").format(new Date(order.createdAt)),
      order.orderNumber,
      order.user?.name || "",
      order.user?.email || "",
      order.user?.phone || "",
      order.vehicleNo || "",
      getReportDisplayStatusLabel(order),
      formatCsvMoney(getOrderAmount(order)),
      formatCsvMoney(Number(order.totalPaid ?? 0)),
      formatCsvMoney(getOrderOutstandingBalance(order)),
      getPaymentStatusLabel(order),
      getPaymentBreakdown(order),
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="customer-payment-balance-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
