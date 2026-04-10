import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { type OrderWithRelations } from "@/components/order-table";

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

function getOrderAmount(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customGrandTotal ?? order.totalAmount ?? 0;
  }

  return order.totalAmount ?? 0;
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

  const rows = [
    [
      "Date",
      "Order No.",
      "Customer",
      "Customer Email",
      "Customer Phone",
      "Order Type",
      "Title / Summary",
      "Tuning Type",
      "Vehicle No.",
      "Status",
      "Total",
    ],
    ...result.orders.map((order) => [
      new Intl.DateTimeFormat("en-GB").format(new Date(order.createdAt)),
      order.orderNumber,
      order.user?.name || "",
      order.user?.email || "",
      order.user?.phone || "",
      getOrderTypeLabel(order.orderType),
      getOrderTitle(order),
      getTuningTypeLabel(order),
      order.vehicleNo || "",
      getReportDisplayStatusLabel(order),
      getOrderAmount(order),
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sales-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
