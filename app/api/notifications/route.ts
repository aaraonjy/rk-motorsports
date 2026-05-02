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
  customerKey: string;
  title: string;
  message: string;
};

function getCreditNotificationCustomerKey(message: string) {
  const text = String(message || "").trim();
  if (!text) return "";

  const hasIndex = text.indexOf(" has " );
  if (hasIndex > -1) return text.slice(0, hasIndex).trim();

  const outstandingIndex = text.indexOf(" outstanding " );
  if (outstandingIndex > -1) return text.slice(0, outstandingIndex).trim();

  return text;
}

function buildCreditNotificationKey(type: NotificationType, customerKey: string) {
  return `${type}::${customerKey}`;
}

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
        customerKey: displayName,
        title: "Credit Terms Overdue",
        message: `${displayName} has overdue outstanding invoice amount ${currency} ${overdueAmount.toFixed(2)}${oldestOverdueDays > 0 ? `, oldest overdue ${oldestOverdueDays} day(s)` : ""}.`,
      });
      continue;
    }

    if (creditLimitActive && outstandingAmount > limit) {
      warnings.push({
        type: "CREDIT_LIMIT_EXCEEDED" as NotificationType,
        customerKey: displayName,
        title: "Credit Limit Exceeded",
        message: `${displayName} outstanding invoice amount is ${currency} ${outstandingAmount.toFixed(2)}, credit limit is ${currency} ${limit.toFixed(2)}.`,
      });
    }
  }

  return warnings;
}

async function syncCreditControlNotifications(userId: string) {
  const activeWarnings = await getActiveCreditWarnings();
  const activeWarningMap = new Map(
    activeWarnings.map((warning) => [buildCreditNotificationKey(warning.type, warning.customerKey), warning])
  );

  const existingCreditNotifications = await db.notification.findMany({
    where: {
      userId,
      type: { in: ["CREDIT_TERMS_OVERDUE", "CREDIT_LIMIT_EXCEEDED"] as NotificationType[] },
    },
    orderBy: { createdAt: "desc" },
  });

  const existingByKey = new Map<string, typeof existingCreditNotifications>();

  for (const notification of existingCreditNotifications) {
    const customerKey = getCreditNotificationCustomerKey(notification.message);
    if (!customerKey) continue;

    const key = buildCreditNotificationKey(notification.type, customerKey);
    const list = existingByKey.get(key) || [];
    list.push(notification);
    existingByKey.set(key, list);
  }

  for (const warning of activeWarnings) {
    const key = buildCreditNotificationKey(warning.type, warning.customerKey);
    const existingList = existingByKey.get(key) || [];
    const primary = existingList[0];

    if (primary) {
      if (primary.title !== warning.title || primary.message !== warning.message) {
        await db.notification.update({
          where: { id: primary.id },
          data: {
            title: warning.title,
            message: warning.message,
          },
        });
      }

      const duplicateIds = existingList.slice(1).map((item) => item.id);
      if (duplicateIds.length > 0) {
        await db.notification.deleteMany({ where: { id: { in: duplicateIds } } });
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

  const inactiveCreditNotificationIds = existingCreditNotifications
    .filter((item) => {
      const customerKey = getCreditNotificationCustomerKey(item.message);
      if (!customerKey) return false;
      const key = buildCreditNotificationKey(item.type, customerKey);
      return !activeWarningMap.has(key);
    })
    .map((item) => item.id);

  if (inactiveCreditNotificationIds.length > 0) {
    await db.notification.deleteMany({ where: { id: { in: inactiveCreditNotificationIds } } });
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
