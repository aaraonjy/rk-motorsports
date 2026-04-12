import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

export async function POST(req: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "You must be logged in." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Only admin can clean audit logs." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const retentionDays = Math.max(1, Number(body.retentionDays || 180));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    try {
      await createAuditLogFromRequest({
        req,
        user,
        module: "Audit Logs",
        action: "CLEANUP",
        entityType: "AuditLog",
        entityCode: `Retention ${retentionDays} Days`,
        description: `${user.name} deleted audit logs older than ${retentionDays} days.`,
        newValues: {
          retentionDays,
          deletedCount: result.count,
          cutoffDate: cutoffDate.toISOString(),
        },
        status: "SUCCESS",
      });
    } catch (error) {
      console.error("Audit log creation failed:", error);
    }

    return NextResponse.json({
      ok: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("POST /api/admin/settings/audit-logs/cleanup failed:", error);

    return NextResponse.json(
      { ok: false, error: "Unable to clean audit logs right now." },
      { status: 500 }
    );
  }
}
