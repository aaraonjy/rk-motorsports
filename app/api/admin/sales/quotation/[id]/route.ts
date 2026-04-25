import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action !== "cancel") {
      return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
    }

    const reason = typeof body.cancelReason === "string" && body.cancelReason.trim() ? body.cancelReason.trim() : "Cancelled by admin.";

    const transaction = await db.salesTransaction.findUnique({ where: { id }, select: { id: true, docNo: true, status: true, docType: true } });
    if (!transaction || transaction.docType !== "QO") {
      return NextResponse.json({ ok: false, error: "Quotation not found." }, { status: 404 });
    }
    if (transaction.status === "CANCELLED") {
      return NextResponse.json({ ok: false, error: "Quotation is already cancelled." }, { status: 400 });
    }

    const updated = await db.salesTransaction.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledByAdminId: admin.id,
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Sales Quotation",
      action: "CANCEL",
      entityType: "SalesTransaction",
      entityId: updated.id,
      entityCode: updated.docNo,
      description: `${admin.name} cancelled quotation ${updated.docNo}.`,
      newValues: {
        cancelReason: reason,
      },
      status: "SUCCESS",
    }).catch(() => null);

    return NextResponse.json({ ok: true, transaction: updated });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update quotation." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
