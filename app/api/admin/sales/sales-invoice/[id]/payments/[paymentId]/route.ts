import { NextResponse } from "next/server";
import { Prisma, SalesTransactionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string; paymentId: string }> };

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calculateSalesAdjustmentSummary(
  lines?: Array<{ sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: Prisma.Decimal | number | string | null; targetTransaction?: { status?: string | null; docType?: string | null } | null }> }>,
  sourceLinks?: Array<{ targetTransaction?: { status?: string | null; docType?: string | null; grandTotal?: Prisma.Decimal | number | string | null } | null }>
) {
  const lineCredited = (lines || []).reduce((lineSum, line) => {
    return lineSum + (line.sourceLineLinks || [])
      .filter((link) => link.linkType === "CREDITED_TO")
      .filter((link) => link.targetTransaction?.status !== "CANCELLED")
      .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
  }, 0);

  const linkedCreditNotes = (sourceLinks || [])
    .filter((link) => link.targetTransaction?.docType === "CN")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.targetTransaction?.grandTotal), 0);

  const linkedDebitNotes = (sourceLinks || [])
    .filter((link) => link.targetTransaction?.docType === "DN")
    .filter((link) => link.targetTransaction?.status !== "CANCELLED")
    .reduce((sum, link) => sum + toNumber(link.targetTransaction?.grandTotal), 0);

  return {
    totalCredited: Math.round(((linkedCreditNotes > 0 ? linkedCreditNotes : lineCredited) + Number.EPSILON) * 100) / 100,
    totalDebited: Math.round((linkedDebitNotes + Number.EPSILON) * 100) / 100,
  };
}

function calculatePaymentSummary(transaction: any) {
  const payments: Array<{ amount?: Prisma.Decimal | number | string | null }> = Array.isArray(transaction.payments) ? transaction.payments : [];
  const totalPaid = Math.round((payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0) + Number.EPSILON) * 100) / 100;
  const adjustment = calculateSalesAdjustmentSummary(transaction.lines || [], transaction.sourceLinks || []);
  const grandTotal = toNumber(transaction.grandTotal);
  const adjustedGrandTotal = Math.max(0, Math.round((grandTotal - adjustment.totalCredited + adjustment.totalDebited + Number.EPSILON) * 100) / 100);
  const outstandingBalance = Math.max(0, Math.round((adjustedGrandTotal - totalPaid + Number.EPSILON) * 100) / 100);
  return {
    totalPaid,
    totalCredited: adjustment.totalCredited,
    totalDebited: adjustment.totalDebited,
    adjustedGrandTotal,
    outstandingBalance,
    paymentStatus: outstandingBalance <= 0 ? "PAID" : totalPaid > 0 || adjustment.totalCredited > 0 || adjustment.totalDebited > 0 ? "PARTIALLY_PAID" : "UNPAID",
  };
}

function getStatusForSummary(summary: ReturnType<typeof calculatePaymentSummary>) {
  if (summary.adjustedGrandTotal <= 0 || summary.outstandingBalance <= 0) return "COMPLETED" as SalesTransactionStatus;
  return "OPEN" as SalesTransactionStatus;
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id, paymentId } = await params;

    const transaction = await db.$transaction(async (tx) => {
      const current = await tx.salesTransaction.findUnique({
        where: { id },
        include: {
          payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } },
          sourceLinks: { include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } } },
          lines: { include: { sourceLineLinks: { include: { targetTransaction: { select: { id: true, docType: true, status: true, grandTotal: true } } } } } },
        },
      });

      if (!current || current.docType !== "INV") throw new Error("Sales Invoice not found.");
      if (current.status === "CANCELLED") throw new Error("Cancelled Sales Invoice payment cannot be deleted.");

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
          sourceLinks: { include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } } },
          payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } },
          lines: { orderBy: { lineNo: "asc" }, include: { sourceLineLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } }, targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } } } } },
        },
      });

      if (!updated) throw new Error("Sales Invoice not found after payment delete.");
      const summary = calculatePaymentSummary(updated);
      const nextStatus = getStatusForSummary(summary);
      const saved = updated.status === nextStatus ? updated : await tx.salesTransaction.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          cancelledByAdmin: { select: { id: true, name: true, email: true } },
          revisedFrom: { select: { id: true, docNo: true } },
          revisions: { select: { id: true, docNo: true, status: true } },
          targetLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } } },
          sourceLinks: { include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } } },
          payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }], include: { createdByAdmin: { select: { id: true, name: true, email: true } } } },
          lines: { orderBy: { lineNo: "asc" }, include: { sourceLineLinks: { include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } }, targetTransaction: { select: { id: true, docType: true, docNo: true, status: true, grandTotal: true } } } } } },
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
