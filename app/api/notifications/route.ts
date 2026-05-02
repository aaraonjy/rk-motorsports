import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { NotificationType } from "@prisma/client";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

type CreditWarning = {
  type: NotificationType;
  title: string;
  message: string;
};

async function getActiveCreditWarnings() {
  const customers = await db.user.findMany({
    where: { role: "CUSTOMER" },
    select: {
      id: true,
      name: true,
      customerAccountNo: true,
      currency: true,
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
              targetTransaction: {
                select: { docType: true, status: true, grandTotal: true },
              },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const warnings: CreditWarning[] = [];

  for (const customer of customers) {
    const terms = Math.max(0, Number(customer.creditTermsDays ?? 0) || 0);
    const limit = Math.max(0, toNumber(customer.creditLimitAmount));
    const creditTermsActive = terms > 0;
    const creditLimitActive = !creditTermsActive && limit > 0;

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

      if (creditTermsActive) {
        const dueDate = new Date(invoice.docDate);
        dueDate.setDate(dueDate.getDate() + terms);

        if (dueDate.getTime() < now.getTime()) {
          overdueAmount += outstanding;
          const overdueDays = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
          oldestOverdueDays = Math.max(oldestOverdueDays, overdueDays);
        }
      }
    }

    outstandingAmount = Math.round((outstandingAmount + Number.EPSILON) * 100) / 100;
    overdueAmount = Math.round((overdueAmount + Number.EPSILON) * 100) / 100;

    const displayName = `${customer.customerAccountNo || "-"} — ${customer.name}`;
    const currency = customer.currency || "MYR";

    if (creditTermsActive && overdueAmount > 0) {
      warnings.push({
        type: "CREDIT_TERMS_OVERDUE" as NotificationType,
        title: "Credit Terms Overdue",
        message: `${displayName} has overdue outstanding invoice amount ${currency} ${overdueAmount.toFixed(2)}${oldestOverdueDays > 0 ? `, oldest overdue ${oldestOverdueDays} day(s)` : ""}.`,
      });
      continue;
    }

    if (creditLimitActive && outstandingAmount > limit) {
      warnings.push({
        type: "CREDIT_LIMIT_EXCEEDED" as NotificationType,
        title: "Credit Limit Exceeded",
        message: `${displayName} outstanding invoice amount is ${currency} ${outstandingAmount.toFixed(2)}, credit limit is ${currency} ${limit.toFixed(2)}.`,
      });
    }
  }

  return warnings;
}

async function syncCreditControlNotifications(userId: string) {
  const activeWarnings = await getActiveCreditWarnings();
  const activeKeys = new Set(activeWarnings.map((warning) => `${warning.type}::${warning.message.split(" has ")[0].split(" outstanding ")[0]}`));

  const existingCreditNotifications = await db.notification.findMany({
    where: {
      userId,
      type: { in: ["CREDIT_TERMS_OVERDUE", "CREDIT_LIMIT_EXCEEDED"] as NotificationType[] },
    },
    orderBy: { createdAt: "desc" },
  });

  for (const warning of activeWarnings) {
    const displayKey = warning.message.split(" has ")[0].split(" outstanding ")[0];
    const existing = existingCreditNotifications.find(
      (item) => item.type === warning.type && item.message.startsWith(displayKey)
    );

    if (existing) {
      if (existing.title !== warning.title || existing.message !== warning.message) {
        await db.notification.update({
          where: { id: existing.id },
          data: {
            title: warning.title,
            message: warning.message,
            isRead: false,
            readAt: null,
          },
        });
      }
      continue;
    }

    await db.notification.create({
      data: {
        userId,
        type: warning.type,
        title: warning.title,
        message: warning.message,
      },
    });
  }

  const inactiveUnreadIds = existingCreditNotifications
    .filter((item) => {
      const displayKey = item.message.split(" has ")[0].split(" outstanding ")[0];
      return !activeKeys.has(`${item.type}::${displayKey}`) && !item.isRead;
    })
    .map((item) => item.id);

  if (inactiveUnreadIds.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: inactiveUnreadIds } },
      data: { isRead: true, readAt: new Date() },
    });
  }
}

export async function GET() {
  try {
    const user = await requireUser();

    if (user.role === "ADMIN") {
      await syncCreditControlNotifications(user.id);
    }

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

    return NextResponse.json({
      notifications: notifications.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
        orderId: item.order?.id ?? null,
        orderNumber: item.order?.orderNumber ?? null,
        href:
          item.type === "CREDIT_TERMS_OVERDUE" || item.type === "CREDIT_LIMIT_EXCEEDED"
            ? "/admin/customers"
            : user.role === "ADMIN"
              ? item.order?.orderNumber
                ? `/admin?search=${encodeURIComponent(item.order.orderNumber)}`
                : "/admin"
              : "/dashboard",
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json(
      { message: "Failed to load notifications." },
      { status: 500 }
    );
  }
}
