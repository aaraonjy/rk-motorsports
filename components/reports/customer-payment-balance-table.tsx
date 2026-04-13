"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type PaymentRecord = {
  id: string;
  paymentDate: string;
  paymentMode: string;
  amount: string;
};

type TableRow = {
  id: string;
  date: string;
  orderNumber: string;
  customerName: string;
  vehicleNo: string;
  orderStatusLabel: string;
  orderStatusBadgeClass: string;
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  totalPaid: string;
  outstandingBalance: string;
  paymentStatusLabel: string;
  paymentStatusBadgeClass: string;
  paymentRecords: PaymentRecord[];
};

function PaymentBreakdownModal({
  row,
  onClose,
}: {
  row: TableRow | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!row) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [row]);

  useEffect(() => {
    if (!row) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [row, onClose]);

  if (!row || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Payment Breakdown</h3>
            <p className="mt-1 text-sm text-white/50">
              {row.orderNumber} • {row.customerName}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Subtotal</div>
            <div className="mt-2 text-lg font-semibold text-white">{row.subtotal}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Tax Amount</div>
            <div className="mt-2 text-lg font-semibold text-white">{row.taxAmount}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Grand Total</div>
            <div className="mt-2 text-lg font-semibold text-white">{row.grandTotal}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Total Paid</div>
            <div className="mt-2 text-lg font-semibold text-white">{row.totalPaid}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Outstanding</div>
            <div className="mt-2 text-lg font-semibold text-white">{row.outstandingBalance}</div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-medium text-white">
            Payment Records
          </div>

          {row.paymentRecords.length === 0 ? (
            <div className="px-4 py-6 text-sm text-white/50">No payment recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-white/80">
                <thead className="bg-black/30 text-white/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Payment Mode</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {row.paymentRecords.map((payment) => (
                    <tr key={payment.id} className="border-t border-white/10">
                      <td className="px-4 py-3">{payment.paymentDate}</td>
                      <td className="px-4 py-3">{payment.paymentMode}</td>
                      <td className="px-4 py-3 text-right font-medium text-white">{payment.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CustomerPaymentBalanceTable({ rows }: { rows: TableRow[] }) {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const activeRow = useMemo(
    () => rows.find((row) => row.id === activeRowId) || null,
    [rows, activeRowId]
  );

  if (rows.length === 0) {
    return <div className="px-6 py-12 text-center text-white/55">No report data found for the selected filters.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-white/80">
          <thead className="bg-black/30 text-white/50">
            <tr>
              <th className="px-6 py-4 font-medium">Date</th>
              <th className="px-6 py-4 font-medium">Order No.</th>
              <th className="px-6 py-4 font-medium">Customer</th>
              <th className="px-6 py-4 font-medium">Vehicle No.</th>
              <th className="px-6 py-4 font-medium">Order Status</th>
              <th className="px-6 py-4 font-medium text-right">Subtotal</th>
              <th className="px-6 py-4 font-medium text-right">Tax Amount</th>
              <th className="px-6 py-4 font-medium text-right">Grand Total</th>
              <th className="px-6 py-4 font-medium text-right">Total Paid</th>
              <th className="px-6 py-4 font-medium text-right">Outstanding Balance</th>
              <th className="px-6 py-4 font-medium">Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setActiveRowId(row.id)}
                className="cursor-pointer border-t border-white/10 align-top transition hover:bg-white/[0.05]"
              >
                <td className="px-6 py-5 text-white/65">{row.date}</td>
                <td className="px-6 py-5 font-medium text-white">{row.orderNumber}</td>
                <td className="px-6 py-5 text-white/90">{row.customerName}</td>
                <td className="px-6 py-5 text-white/90">{row.vehicleNo}</td>
                <td className="px-6 py-5 text-white/65">
                  <span className={row.orderStatusBadgeClass}>{row.orderStatusLabel}</span>
                </td>
                <td className="px-6 py-5 text-right font-medium text-white">{row.subtotal}</td>
                <td className="px-6 py-5 text-right font-medium text-white">{row.taxAmount}</td>
                <td className="px-6 py-5 text-right font-medium text-white">{row.grandTotal}</td>
                <td className="px-6 py-5 text-right font-medium text-white">{row.totalPaid}</td>
                <td className="px-6 py-5 text-right font-medium text-white">{row.outstandingBalance}</td>
                <td className="px-6 py-5 text-white/65">
                  <span className={row.paymentStatusBadgeClass}>{row.paymentStatusLabel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaymentBreakdownModal row={activeRow} onClose={() => setActiveRowId(null)} />
    </>
  );
}
