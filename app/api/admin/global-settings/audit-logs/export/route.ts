import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

function getDateFromPeriod(period: number) {
  const date = new Date();
  date.setDate(date.getDate() - period);
  return date;
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
    return NextResponse.json({ ok: false, error: "Only admin can export audit logs." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const selectedPeriod = Math.max(1, Number(searchParams.get("period") || "30") || 30);
  const selectedUser = (searchParams.get("user") || "ALL").trim();
  const selectedModule = (searchParams.get("module") || "ALL").trim();
  const selectedAction = (searchParams.get("action") || "ALL").trim();
  const selectedStatus = (searchParams.get("status") || "ALL").trim();
  const searchKeyword = (searchParams.get("q") || "").trim();
  const documentKeyword = (searchParams.get("doc") || "").trim();

  const where = {
    createdAt: {
      gte: getDateFromPeriod(selectedPeriod),
    },
    ...(selectedUser !== "ALL" ? { userEmail: selectedUser } : {}),
    ...(selectedModule !== "ALL" ? { module: selectedModule } : {}),
    ...(selectedAction !== "ALL" ? { action: selectedAction } : {}),
    ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}),
    ...(documentKeyword
      ? {
          entityCode: {
            contains: documentKeyword,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(searchKeyword
      ? {
          OR: [
            { description: { contains: searchKeyword, mode: "insensitive" as const } },
            { entityCode: { contains: searchKeyword, mode: "insensitive" as const } },
            { userName: { contains: searchKeyword, mode: "insensitive" as const } },
            { userEmail: { contains: searchKeyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const csvRows = [
    [
      "Date",
      "Time",
      "User",
      "User Email",
      "Module",
      "Action",
      "Document",
      "Description",
      "IP",
      "Location",
      "Status",
      "Request ID",
    ],
    ...logs.map((log) => {
      const date = new Date(log.createdAt);
      const datePart = Number.isNaN(date.getTime())
        ? "-"
        : new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }).format(date);
      const timePart = Number.isNaN(date.getTime())
        ? "-"
        : new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }).format(date);

      return [
        datePart,
        timePart,
        log.userName || "System",
        log.userEmail || "",
        log.module,
        log.action,
        log.entityCode || "",
        log.description,
        log.ipAddress || "",
        log.location || log.ipAddress || "",
        log.status,
        log.requestId || "",
      ];
    }),
  ];

  const csv = csvRows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  try {
    await createAuditLogFromRequest({
      req,
      user,
      module: "Audit Logs",
      action: "EXPORT",
      entityType: "AuditLog",
      entityCode: "Audit Logs CSV",
      description: `${user.name} exported Audit Logs CSV.`,
      newValues: {
        period: selectedPeriod,
        user: selectedUser,
        module: selectedModule,
        action: selectedAction,
        status: selectedStatus,
        q: searchKeyword,
        doc: documentKeyword,
        exportedRows: logs.length,
      },
      status: "SUCCESS",
    });
  } catch (error) {
    console.error("Audit log creation failed:", error);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-logs.csv"',
      "Cache-Control": "no-store",
    },
  });
}
