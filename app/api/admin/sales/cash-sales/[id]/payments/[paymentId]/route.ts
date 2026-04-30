import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string; paymentId: string }> };

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calculatePaymentSummary(transaction: any) {
  const payments = Array.isArray(transaction.payments) ? transaction.payments : [];
  const grandTotal = toNumber(transaction.grandTotal);
  const totalPaid = Math.round((payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0) + Number.EPSILON) * 100) / 100;
  const outstandingBalance = Math.max(0, Math.round((grandTotal - totalPaid + Number.EPSILON) * 100) / 100);
  return {
    totalPaid,
    outstandingBalance,
    paymentStatus: outstandingBalance <= 0 ? "PAID" : totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID",
  };
}

function getStatusForSummary(grandTotal: Prisma.Decimal | number | string | null | undefined, summary: ReturnType<typeof calculatePaymentSummary>) {
  if (toNumber(grandTotal) <= 0 || summary.outstandingBalance <= 0) return "COMPLETED" as SalesTransactionStatus;
  return "OPEN" as SalesTransactionStatus;
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id, paymentId } = await params;

    const transaction = await db.$transaction(async (tx) => {
      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: { payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } } },
      });

      if (!current || current.docType !== "CS") throw new Error("Cash Sales not found.");
      if (current.status === "CANCELLED") throw new Error("Cancelled Cash Sales payment cannot be deleted.");

      const payment = current.payments.find((item) => item.id === paymentId);
      if (!payment) throw new Error("Payment record not found.");

      await tx.salesTransactionPayment.delete({ where: { id: paymentId } });

      const updated = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          revisedFrom: { select: { id: true, docNo: true } },
          revisions: { select: { id: true, docNo: true, status: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      });

      if (!updated) throw new Error("Cash Sales not found after payment delete.");
      const summary = calculatePaymentSummary(updated);
      const nextStatus = getStatusForSummary(updated.grandTotal, summary);
      const saved = updated.status === nextStatus ? updated : await tx.salesTransaction.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          revisedFrom: { select: { id: true, docNo: true } },
          revisions: { select: { id: true, docNo: true, status: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } },
          lines: { orderBy: { lineNo: "asc" } },
        },
      });

      const finalSummary = calculatePaymentSummary(saved);
      return { ...saved, ...finalSummary };
    });

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to delete payment." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}
