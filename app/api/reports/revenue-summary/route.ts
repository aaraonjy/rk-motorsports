import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { type OrderWithRelations } from "@/components/order-table";

type RevenueRow = {
  periodKey: string;
  periodLabel: string;
  totalOrders: number;
  totalRevenue: number;
  completedRevenue: number;
  pendingRevenue: number;
};

function getOrderAmount(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return order.customGrandTotal ?? order.totalAmount ?? 0;
  }

  return order.totalAmount ?? 0;
}

function getDisplayStatus(order: OrderWithRelations) {
  const isAdminCreatedOrder = !!order.createdByAdminId;

  if (
    isAdminCreatedOrder &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED"
  ) {
    return "FILE_RECEIVED";
  }

  return order.status;
}

function buildPeriod(dateValue: Date, viewBy: string) {
  const year = dateValue.getFullYear();
  const month = dateValue.getMonth();
  const day = dateValue.getDate();

  if (viewBy === "YEARLY") {
    return {
      key: `${year}`,
      label: `${year}`,
    };
  }

  if (viewBy === "DAILY") {
    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-MY", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dateValue),
    };
  }

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("en-MY", {
      year: "numeric",
      month: "long",
    }).format(dateValue),
  };
}

function buildRevenueRows(orders: OrderWithRelations[], viewBy: string) {
  const map = new Map<string, RevenueRow>();

  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const period = buildPeriod(createdAt, viewBy);
    const amount = getOrderAmount(order);
    const displayStatus = getDisplayStatus(order);

    if (!map.has(period.key)) {
      map.set(period.key, {
        periodKey: period.key,
        periodLabel: period.label,
        totalOrders: 0,
        totalRevenue: 0,
        completedRevenue: 0,
        pendingRevenue: 0,
      });
    }

    const row = map.get(period.key)!;
    row.totalOrders += 1;
    row.totalRevenue += amount;

    if (displayStatus === "COMPLETED" || displayStatus === "READY_FOR_DOWNLOAD") {
      row.completedRevenue += amount;
    } else if (displayStatus !== "CANCELLED") {
      row.pendingRevenue += amount;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
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
  const orderType = searchParams.get("orderType") || "ALL";
  const viewBy = searchParams.get("viewBy") === "YEARLY" || searchParams.get("viewBy") === "DAILY"
    ? searchParams.get("viewBy")!
    : "MONTHLY";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const result = (await getAllOrders({
    status,
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

  const rows = buildRevenueRows(result.orders, viewBy);

  const csvRows = [
    [
      viewBy === "YEARLY" ? "Year" : viewBy === "DAILY" ? "Date" : "Month",
      "Orders",
      "Revenue",
      "Completed Revenue",
      "Pending Revenue",
    ],
    ...rows.map((row) => [
      row.periodLabel,
      row.totalOrders,
      row.totalRevenue,
      row.completedRevenue,
      row.pendingRevenue,
    ]),
  ];

  const csv = csvRows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="revenue-summary.csv"',
      "Cache-Control": "no-store",
    },
  });
}
