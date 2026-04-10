export type PaymentSummaryInput = {
  amount: number;
};

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export function calculatePaymentSummary(
  payments: PaymentSummaryInput[],
  grandTotal: number
) {
  const safeGrandTotal = Number.isFinite(grandTotal) && grandTotal > 0 ? Math.floor(grandTotal) : 0;

  const totalPaid = payments.reduce((sum, payment) => {
    const amount = Number.isFinite(payment.amount) && payment.amount > 0 ? Math.floor(payment.amount) : 0;
    return sum + amount;
  }, 0);

  const outstandingBalance = Math.max(safeGrandTotal - totalPaid, 0);

  return {
    totalPaid,
    outstandingBalance,
  };
}

export function getPaymentStatus(totalPaid: number, grandTotal: number): PaymentStatus {
  const safeTotalPaid = Number.isFinite(totalPaid) && totalPaid > 0 ? Math.floor(totalPaid) : 0;
  const safeGrandTotal = Number.isFinite(grandTotal) && grandTotal > 0 ? Math.floor(grandTotal) : 0;

  if (safeTotalPaid <= 0) return "UNPAID";
  if (safeTotalPaid < safeGrandTotal) return "PARTIALLY_PAID";
  return "PAID";
}
