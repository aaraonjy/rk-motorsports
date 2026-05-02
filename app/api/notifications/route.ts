import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function getCreditControlNotifications() {
  const customers = await db.user.findMany({
    where: { role: "CUSTOMER" },
    select: {
      id: true,
      name: true,
      customerAccountNo: true,
      creditTermsDays: true,
      creditLimitAmount: true,
      customerSalesTransactions: {
        where: { docType: "INV", status: { not: "CANCELLED" } },
        select: {
          id: true,
          docNo: true,
          docDate: true,
          grandTotal: true,
          payments: { select: { amount: true } },
          sourceLinks: {
            select: {
              targetTransaction: { select: { docType: true, status: true, grandTotal: true } },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const warnings: Array<{ id: string; title: string; message: string; isRead: boolean; createdAt: string; orderId: null; orderNumber: null; href: string }> = [];

  for (const customer of customers) {
    const terms = Math.max(0, Number(customer.creditTermsDays ?? 0) || 0);
    const limit = Math.max(0, toNumber(customer.creditLimitAmount));
    let outstandingAmount = 0;
    let overdueAmount = 0;
    let oldestOverdueDays = 0;

    for (const invoice of customer.customerSalesTransactions) {
      const totalPaid = invoice.payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
      const adjustment = invoice.sourceLinks.reduce((sum, link) => {
        const target = link.targetTransaction;
        if (!target || target.status === "CANCELLED") return sum;
        if (target.docType === "CN") return sum - toNumber(target.grandTotal);
        if (target.docType === "DN") return sum + toNumber(target.grandTotal);
        return sum;
      }, 0);
      const adjustedTotal = Math.max(0, toNumber(invoice.grandTotal) + adjustment);
      const outstanding = Math.max(0, Math.round((adjustedTotal - totalPaid + Number.EPSILON) * 100) / 100);
      if (outstanding <= 0) continue;
      outstandingAmount += outstanding;

      const dueDate = new Date(invoice.docDate);
      dueDate.setDate(dueDate.getDate() + terms);
      if (terms === 0 || dueDate.getTime() < now.getTime()) {
        overdueAmount += outstanding;
        const overdueDays = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        oldestOverdueDays = Math.max(oldestOverdueDays, overdueDays);
      }
    }

    outstandingAmount = Math.round((outstandingAmount + Number.EPSILON) * 100) / 100;
    overdueAmount = Math.round((overdueAmount + Number.EPSILON) * 100) / 100;
    const displayName = `${customer.customerAccountNo || "-"} — ${customer.name}`;

    if (overdueAmount > 0) {
      warnings.push({
        id: `credit-overdue-${customer.id}`,
        title: "Credit Terms Overdue",
        message: `${displayName} has overdue outstanding invoice amount RM ${overdueAmount.toFixed(2)}${oldestOverdueDays > 0 ? `, oldest overdue ${oldestOverdueDays} day(s)` : ""}.`,
        isRead: false,
        createdAt: now.toISOString(),
        orderId: null,
        orderNumber: null,
        href: `/admin/customers/${customer.id}`,
      });
      continue;
    }

    if (outstandingAmount > 0 && (limit <= 0 || outstandingAmount > limit)) {
      warnings.push({
        id: `credit-limit-${customer.id}`,
        title: "Credit Limit Exceeded",
        message: `${displayName} outstanding invoice amount is RM ${outstandingAmount.toFixed(2)}, credit limit is RM ${limit.toFixed(2)}.`,
        isRead: false,
        createdAt: now.toISOString(),
        orderId: null,
        orderNumber: null,
        href: `/admin/customers/${customer.id}`,
      });
    }
  }

  return warnings.slice(0, 10);
}

export async function GET() {
  try {
    const user = await requireUser();

    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });

    const unreadCount = await db.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    const creditNotifications = user.role === "ADMIN" ? await getCreditControlNotifications() : [];

    return NextResponse.json({
      notifications: [
        ...creditNotifications,
        ...notifications.map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
          isRead: item.isRead,
          createdAt: item.createdAt.toISOString(),
          orderId: item.order?.id ?? null,
          orderNumber: item.order?.orderNumber ?? null,
          href:
            user.role === "ADMIN"
              ? item.order?.orderNumber
                ? `/admin?search=${encodeURIComponent(item.order.orderNumber)}`
                : "/admin"
              : "/dashboard",
        })),
      ].slice(0, 10),
      unreadCount: unreadCount + creditNotifications.length,
    });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json(
      { message: "Failed to load notifications." },
      { status: 500 }
    );
  }
}
