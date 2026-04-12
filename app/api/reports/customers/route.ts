import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCustomersReport } from "@/lib/queries";

function escapeCsvValue(value: unknown) {
  const normalized = String(value ?? "");
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

type CustomerReportRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  accountSource: "PORTAL" | "ADMIN";
  portalAccess: boolean;
  createdAt: Date;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: Date | null;
};

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
  const source = searchParams.get("source") || "ALL";
  const portalAccess = searchParams.get("portalAccess") || "ALL";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const customers = (await getCustomersReport({
    search,
    source,
    portalAccess,
    dateFrom,
    dateTo,
  })) as CustomerReportRecord[];

  const rows = [
    [
      "Customer Name",
      "Phone",
      "Email",
      "Account Source",
      "Portal Access",
      "Total Orders",
      "Total Spent",
      "Last Order Date",
    ],
    ...customers.map((customer) => [
      customer.name,
      customer.phone || "",
      customer.email,
      customer.accountSource === "ADMIN" ? "Admin Created" : "Self Registered",
      customer.portalAccess ? "Enabled" : "Disabled",
      customer.totalOrders,
      formatCsvMoney(customer.totalSpent),
      customer.lastOrderDate ? customer.lastOrderDate.toISOString() : "",
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="customer-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
