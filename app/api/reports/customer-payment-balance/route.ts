import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { type OrderWithRelations } from "@/components/order-table";

function getOrderAmount(order: OrderWithRelations) {
  return order.customGrandTotal ?? order.totalAmount ?? 0;
}

function getOrderOutstandingBalance(order: OrderWithRelations) {
  const grandTotal = getOrderAmount(order);
  const outstanding = order.outstandingBalance ?? Math.max(grandTotal - (order.totalPaid ?? 0), 0);
  return Math.max(outstanding, 0);
}

function getPaymentStatusLabel(order: OrderWithRelations) {
  const totalPaid = order.totalPaid ?? 0;
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
      return order.status.replaceAll("_", " ");
  }
}

function escapeCsvValue(value: string | number | null | undefined) {
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
    ],
    ...filteredOrders.map((order) => [
      new Intl.DateTimeFormat("en-GB").format(new Date(order.createdAt)),
      order.orderNumber,
      order.user?.name || "",
      order.user?.email || "",
      order.user?.phone || "",
      order.vehicleNo || "",
      getReportDisplayStatusLabel(order),
      getOrderAmount(order),
      order.totalPaid ?? 0,
      getOrderOutstandingBalance(order),
      getPaymentStatusLabel(order),
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
