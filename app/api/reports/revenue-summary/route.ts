import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/queries";
import { type OrderWithRelations } from "@/components/order-table";

type RevenueTransaction = {
  date: Date;
  transactionType: "ORDER" | "CN";
  amount: number;
};

type RevenueRow = {
  periodKey: string;
  periodLabel: string;
  orderTransactions: number;
  cnTransactions: number;
  grossSales: number;
  creditNoteTotal: number;
  netSales: number;
};

function getOrderAmount(order: OrderWithRelations) {
  if (order.orderType === "CUSTOM_ORDER") {
    return Number(order.customGrandTotal ?? order.totalAmount ?? 0);
  }

  return Number(order.totalAmount ?? 0);
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

function buildTransactions(
  orders: OrderWithRelations[],
  dateFrom?: string,
  dateTo?: string
): RevenueTransaction[] {
  const rows: RevenueTransaction[] = [];

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    if (isWithinDateRange(orderDate, dateFrom, dateTo)) {
      rows.push({
        date: orderDate,
        transactionType: "ORDER",
        amount: getOrderAmount(order),
      });
    }

    if (order.creditNote) {
      const cnDate = new Date(order.creditNote.cnDate);
      if (isWithinDateRange(cnDate, dateFrom, dateTo)) {
        rows.push({
          date: cnDate,
          transactionType: "CN",
          amount: Math.abs(Number(order.creditNote.amount || 0)),
        });
      }
    }
  }

  return rows;
}

function buildRevenueRows(transactions: RevenueTransaction[], viewBy: string) {
  const map = new Map<string, RevenueRow>();

  for (const transaction of transactions) {
    const period = buildPeriod(transaction.date, viewBy);

    if (!map.has(period.key)) {
      map.set(period.key, {
        periodKey: period.key,
        periodLabel: period.label,
        orderTransactions: 0,
        cnTransactions: 0,
        grossSales: 0,
        creditNoteTotal: 0,
        netSales: 0,
      });
    }

    const row = map.get(period.key)!;

    if (transaction.transactionType === "ORDER") {
      row.orderTransactions += 1;
      row.grossSales += transaction.amount;
    } else {
      row.cnTransactions += 1;
      row.creditNoteTotal += transaction.amount;
    }

    row.netSales = row.grossSales - row.creditNoteTotal;
  }

  return Array.from(map.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
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
    page: 1,
    pageSize: 10000,
  })) as {
    orders: OrderWithRelations[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };

  const transactions = buildTransactions(result.orders, dateFrom, dateTo);
  const rows = buildRevenueRows(transactions, viewBy);

  const csvRows = [
    [
      viewBy === "YEARLY" ? "Year" : viewBy === "DAILY" ? "Date" : "Month",
      "Order Transactions",
      "CN Transactions",
      "Gross Sales",
      "Credit Note Total",
      "Net Sales",
    ],
    ...rows.map((row) => [
      row.periodLabel,
      row.orderTransactions,
      row.cnTransactions,
      formatCsvMoney(row.grossSales),
      formatCsvMoney(row.creditNoteTotal),
      formatCsvMoney(row.netSales),
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
