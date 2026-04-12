export type PaymentSummaryInput = {
  amount: number;
};

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export function calculatePaymentSummary(
  payments: PaymentSummaryInput[],
  grandTotal: number
) {
  const safeGrandTotal = Number.isFinite(grandTotal) && grandTotal > 0 ? Math.round((grandTotal + Number.EPSILON) * 100) / 100 : 0;

  const totalPaid = payments.reduce((sum, payment) => {
    const amount = Number.isFinite(payment.amount) && payment.amount > 0 ? Math.round((payment.amount + Number.EPSILON) * 100) / 100 : 0;
    return Math.round((sum + amount + Number.EPSILON) * 100) / 100;
  }, 0);

  const outstandingBalance = Math.round((Math.max(safeGrandTotal - totalPaid, 0) + Number.EPSILON) * 100) / 100;

  return {
    totalPaid,
    outstandingBalance,
  };
}

export function getPaymentStatus(totalPaid: number, grandTotal: number): PaymentStatus {
  const safeTotalPaid = Number.isFinite(totalPaid) && totalPaid > 0 ? Math.round((totalPaid + Number.EPSILON) * 100) / 100 : 0;
  const safeGrandTotal = Number.isFinite(grandTotal) && grandTotal > 0 ? Math.round((grandTotal + Number.EPSILON) * 100) / 100 : 0;

  if (safeTotalPaid <= 0) return "UNPAID";
  if (safeTotalPaid < safeGrandTotal) return "PARTIALLY_PAID";
  return "PAID";
}
