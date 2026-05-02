import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

function toCreditNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildCustomerCreditControl(customer: {
  creditTermsDays?: number | null;
  creditLimitAmount?: Prisma.Decimal | number | string | null;
  customerSalesTransactions?: Array<{
    id: string;
    docNo: string;
    docDate: Date;
    grandTotal: Prisma.Decimal | number | string;
    payments?: Array<{ amount: Prisma.Decimal | number | string }>;
    sourceLinks?: Array<{
      targetTransaction?: { docType?: string | null; status?: string | null; grandTotal?: Prisma.Decimal | number | string | null } | null;
    }>;
  }>;
}) {
  const creditTermsDays = Math.max(0, Number(customer.creditTermsDays ?? 0) || 0);
  const creditLimitAmount = Math.max(0, toCreditNumber(customer.creditLimitAmount));
  const now = new Date();

  let outstandingAmount = 0;
  let overdueAmount = 0;
  let oldestOverdueDays = 0;

  for (const invoice of customer.customerSalesTransactions || []) {
    const totalPaid = (invoice.payments || []).reduce((sum, payment) => sum + toCreditNumber(payment.amount), 0);
    const adjustment = (invoice.sourceLinks || []).reduce((sum, link) => {
      const target = link.targetTransaction;
      if (!target || target.status === "CANCELLED") return sum;
      if (target.docType === "CN") return sum - toCreditNumber(target.grandTotal);
      if (target.docType === "DN") return sum + toCreditNumber(target.grandTotal);
      return sum;
    }, 0);
    const adjustedTotal = Math.max(0, toCreditNumber(invoice.grandTotal) + adjustment);
    const outstanding = Math.max(0, Math.round((adjustedTotal - totalPaid + Number.EPSILON) * 100) / 100);
    if (outstanding <= 0) continue;

    outstandingAmount += outstanding;

    if (creditTermsDays > 0) {
      const dueDate = new Date(invoice.docDate);
      dueDate.setDate(dueDate.getDate() + creditTermsDays);
      if (dueDate.getTime() < now.getTime()) {
        overdueAmount += outstanding;
        const overdueDays = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        oldestOverdueDays = Math.max(oldestOverdueDays, overdueDays);
      }
    } else if (outstanding > 0) {
      overdueAmount += outstanding;
      const overdueDays = Math.max(0, Math.floor((now.getTime() - new Date(invoice.docDate).getTime()) / (1000 * 60 * 60 * 24)));
      oldestOverdueDays = Math.max(oldestOverdueDays, overdueDays);
    }
  }

  outstandingAmount = Math.round((outstandingAmount + Number.EPSILON) * 100) / 100;
  overdueAmount = Math.round((overdueAmount + Number.EPSILON) * 100) / 100;

  return {
    creditTermsDays,
    creditLimitAmount,
    creditOutstandingAmount: outstandingAmount,
    creditOverdueAmount: overdueAmount,
    creditOldestOverdueDays: oldestOverdueDays,
    creditLimitExceeded: outstandingAmount > 0 && (creditLimitAmount <= 0 || outstandingAmount > creditLimitAmount),
    creditOverdue: overdueAmount > 0,
  };
}

export async function getProducts() {
  return db.product.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
  });
}

type UserOrdersOptions = {
  page?: number;
  pageSize?: number;
};

export async function getRecentOrdersForUser(
  userId: string,
  options?: UserOrdersOptions
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, options?.pageSize ?? 5);
  const skip = (page - 1) * pageSize;

  const where: Prisma.OrderWhereInput = { userId };

  const [orders, totalCount] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        files: true,
        revisions: {
          include: {
            orderFile: true,
          },
          orderBy: { revisionNo: "desc" },
        },
        items: { include: { product: true } },
        customItems: {
          orderBy: { createdAt: "asc" },
        },
        payments: {
          orderBy: { paymentDate: "asc" },
        },
        creditNote: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);

  return {
    orders,
    totalCount,
    currentPage: page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

type AdminOrderSummaryFilter =
  | "pending_completion"
  | "awaiting_payment"
  | "new_orders"
  | "partially_paid";

export type AdminOrderSummaryCounts = {
  pendingCompletion: number;
  awaitingPayment: number;
  newOrders: number;
  partiallyPaid: number;
};

type AllOrdersOptions = {
  status?: string;
  search?: string;
  customerKeyword?: string;
  tuningType?: string;
  orderType?: string;
  source?: string;
  paymentStatus?: string;
  documentType?: string;
  outstandingOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  summary?: string;
};

function buildPaymentStatusWhere(filters?: AllOrdersOptions): Prisma.OrderWhereInput | null {
  const wantsPaymentStatus = filters?.paymentStatus && filters.paymentStatus !== "ALL";
  const wantsOutstandingOnly = !!filters?.outstandingOnly;

  if (!wantsPaymentStatus && !wantsOutstandingOnly) return null;

  const customOrderBase: Prisma.OrderWhereInput = {
    orderType: "CUSTOM_ORDER",
    status: {
      notIn: ["COMPLETED", "CANCELLED"],
    },
  };

  if (wantsOutstandingOnly && !wantsPaymentStatus) {
    return {
      ...customOrderBase,
      outstandingBalance: {
        gt: 0,
      },
    };
  }

  if (filters?.paymentStatus === "UNPAID") {
    return {
      ...customOrderBase,
      totalPaid: 0,
      ...(wantsOutstandingOnly
        ? {
            outstandingBalance: {
              gt: 0,
            },
          }
        : {}),
    };
  }

  if (filters?.paymentStatus === "PARTIALLY_PAID") {
    return {
      ...customOrderBase,
      totalPaid: {
        gt: 0,
      },
      outstandingBalance: {
        gt: 0,
      },
    };
  }

  if (filters?.paymentStatus === "PAID") {
    return {
      orderType: "CUSTOM_ORDER",
      outstandingBalance: 0,
      ...(wantsOutstandingOnly
        ? {
            id: "__NO_MATCH__",
          }
        : {}),
    };
  }

  return null;
}

function buildSummaryWhere(summary?: string): Prisma.OrderWhereInput | null {
  switch (summary as AdminOrderSummaryFilter | undefined) {
    case "pending_completion":
      return {
        orderType: "CUSTOM_ORDER",
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
        totalPaid: {
          gt: 0,
        },
      };
    case "awaiting_payment":
      return {
        orderType: "CUSTOM_ORDER",
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
        totalPaid: 0,
      };
    case "new_orders":
      return {
        orderType: "STANDARD_TUNING",
        source: "ONLINE_PORTAL",
        status: "FILE_RECEIVED",
      };
    case "partially_paid":
      return {
        orderType: "CUSTOM_ORDER",
        status: {
          not: "CANCELLED",
        },
        totalPaid: {
          gt: 0,
        },
        outstandingBalance: {
          gt: 0,
        },
      };
    default:
      return null;
  }
}

function buildCreatedAtWhere(filters?: AllOrdersOptions) {
  const createdAt: Prisma.DateTimeFilter = {};

  if (filters?.dateFrom) {
    const start = new Date(filters.dateFrom);
    if (!Number.isNaN(start.getTime())) {
      createdAt.gte = start;
    }
  }

  if (filters?.dateTo) {
    const end = new Date(filters.dateTo);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
  }

  return createdAt;
}

function buildOrderWhere(
  filters?: AllOrdersOptions,
  options?: {
    ignoreStatus?: boolean;
    ignorePaymentStatus?: boolean;
    ignoreSummary?: boolean;
  }
): Prisma.OrderWhereInput {
  const createdAt = buildCreatedAtWhere(filters);

  const baseWhere: Prisma.OrderWhereInput = {
    ...(!options?.ignoreStatus && filters?.status && filters.status !== "ALL"
      ? { status: filters.status as any }
      : {}),
    ...(filters?.search
      ? {
          OR: [
            {
              orderNumber: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              creditNote: {
                is: {
                  cnNo: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(filters?.customerKeyword
      ? {
          OR: [
            {
              user: {
                OR: [
                  {
                    name: {
                      contains: filters.customerKeyword,
                      mode: "insensitive",
                    },
                  },
                  {
                    customerAccountNo: {
                      contains: filters.customerKeyword,
                      mode: "insensitive",
                    },
                  },
                  {
                    phone: {
                      contains: filters.customerKeyword,
                      mode: "insensitive",
                    },
                  },
                  {
                    email: {
                      contains: filters.customerKeyword,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
            {
              vehicleNo: {
                contains: filters.customerKeyword,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(filters?.tuningType && filters.tuningType !== "ALL"
      ? {
          orderType: "STANDARD_TUNING",
          tuningType: filters.tuningType as any,
        }
      : {}),
    ...(filters?.orderType && filters.orderType !== "ALL"
      ? { orderType: filters.orderType as any }
      : {}),
    ...(filters?.source && filters.source !== "ALL"
      ? { source: filters.source as any }
      : {}),
    ...(filters?.documentType === "CS"
      ? { docType: "CS" }
      : {}),
    ...(filters?.documentType === "INV"
      ? { docType: "INV" }
      : {}),
    ...(filters?.documentType === "CN"
      ? { creditNote: { isNot: null } }
      : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };

  const clauses: Prisma.OrderWhereInput[] = [baseWhere];

  if (!options?.ignorePaymentStatus) {
    const paymentStatusWhere = buildPaymentStatusWhere(filters);
    if (paymentStatusWhere) {
      clauses.push(paymentStatusWhere);
    }
  }

  if (!options?.ignoreSummary) {
    const summaryWhere = buildSummaryWhere(filters?.summary);
    if (summaryWhere) {
      clauses.push(summaryWhere);
    }
  }

  return clauses.length === 1
    ? baseWhere
    : {
        AND: clauses,
      };
}

export async function getAdminOrderSummaryCounts(
  filters?: AllOrdersOptions
): Promise<AdminOrderSummaryCounts> {
  const summaryContextFilters: AllOrdersOptions = {
    ...filters,
    status: "ALL",
    paymentStatus: "ALL",
    page: undefined,
    pageSize: undefined,
    summary: undefined,
  };

  const [pendingCompletion, awaitingPayment, newOrders, partiallyPaid] =
    await Promise.all([
      db.order.count({
        where: buildOrderWhere(
          {
            ...summaryContextFilters,
            summary: "pending_completion",
          },
          {
            ignoreStatus: true,
            ignorePaymentStatus: true,
          }
        ),
      }),
      db.order.count({
        where: buildOrderWhere(
          {
            ...summaryContextFilters,
            summary: "awaiting_payment",
          },
          {
            ignoreStatus: true,
            ignorePaymentStatus: true,
          }
        ),
      }),
      db.order.count({
        where: buildOrderWhere(
          {
            ...summaryContextFilters,
            summary: "new_orders",
          },
          {
            ignoreStatus: true,
            ignorePaymentStatus: true,
          }
        ),
      }),
      db.order.count({
        where: buildOrderWhere(
          {
            ...summaryContextFilters,
            summary: "partially_paid",
          },
          {
            ignoreStatus: true,
            ignorePaymentStatus: true,
          }
        ),
      }),
    ]);

  return {
    pendingCompletion,
    awaitingPayment,
    newOrders,
    partiallyPaid,
  };
}

export async function getAllOrders(filters?: AllOrdersOptions) {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(1, filters?.pageSize ?? 5);
  const skip = (page - 1) * pageSize;

  const where = buildOrderWhere(filters);

  const [orders, totalCount] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        user: true,
        files: true,
        revisions: {
          include: {
            orderFile: true,
          },
          orderBy: { revisionNo: "desc" },
        },
        items: { include: { product: true } },
        customItems: {
          orderBy: { createdAt: "asc" },
        },
        payments: {
          orderBy: { paymentDate: "asc" },
        },
        creditNote: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);

  return {
    orders,
    totalCount,
    currentPage: page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

type CustomersOptions = {
  search?: string;
  source?: string;
  portalAccess?: string;
  page?: number;
  pageSize?: number;
};

export async function getCustomers(filters?: CustomersOptions) {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(1, filters?.pageSize ?? 10);
  const skip = (page - 1) * pageSize;

  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    ...(filters?.search
      ? {
          OR: [
            {
              name: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              customerAccountNo: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              phone: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(filters?.source && filters.source !== "ALL"
      ? { accountSource: filters.source as any }
      : {}),
    ...(filters?.portalAccess === "ENABLED"
      ? { portalAccess: true }
      : filters?.portalAccess === "DISABLED"
        ? { portalAccess: false }
        : {}),
  };

  const [customers, totalCount] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        customerAccountNo: true,
        email: true,
        phone: true,
        phone2: true,
        fax: true,
        billingAddressLine1: true,
        billingAddressLine2: true,
        billingAddressLine3: true,
        billingAddressLine4: true,
        billingCity: true,
        billingPostCode: true,
        billingCountryCode: true,
        deliveryAddressLine1: true,
        deliveryAddressLine2: true,
        deliveryAddressLine3: true,
        deliveryAddressLine4: true,
        deliveryCity: true,
        deliveryPostCode: true,
        deliveryCountryCode: true,
        area: true,
        attention: true,
        contactPerson: true,
        emailCc: true,
        currency: true,
        agentId: true,
        natureOfBusiness: true,
        registrationIdType: true,
        registrationNo: true,
        taxIdentificationNo: true,
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
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        deliveryAddresses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            addressLine1: true,
            addressLine2: true,
            addressLine3: true,
            addressLine4: true,
            city: true,
            postCode: true,
            countryCode: true,
          },
        },
        accountSource: true,
        portalAccess: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);

  return {
    customers: customers.map((customer) => ({
      ...customer,
      ...buildCustomerCreditControl(customer),
      customerSalesTransactions: undefined,
    })),
    totalCount,
    currentPage: page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

type CustomersReportOptions = {
  search?: string;
  source?: string;
  portalAccess?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function getCustomersReport(filters?: CustomersReportOptions) {
  const createdAt: Prisma.DateTimeFilter = {};

  if (filters?.dateFrom) {
    const start = new Date(filters.dateFrom);
    if (!Number.isNaN(start.getTime())) {
      createdAt.gte = start;
    }
  }

  if (filters?.dateTo) {
    const end = new Date(filters.dateTo);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
  }

  const orderWhere: Prisma.OrderWhereInput = {
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    status: {
      not: "CANCELLED",
    },
  };

  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    orders: {
      some: orderWhere,
    },
    ...(filters?.search
      ? {
          OR: [
            {
              name: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              customerAccountNo: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              phone: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(filters?.source && filters.source !== "ALL"
      ? { accountSource: filters.source as any }
      : {}),
    ...(filters?.portalAccess === "ENABLED"
      ? { portalAccess: true }
      : filters?.portalAccess === "DISABLED"
        ? { portalAccess: false }
        : {}),
  };

  const customers = await db.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      customerAccountNo: true,
      email: true,
      phone: true,
        phone2: true,
        fax: true,
        billingAddressLine1: true,
        billingAddressLine2: true,
        billingAddressLine3: true,
        billingAddressLine4: true,
        billingCity: true,
        billingPostCode: true,
        billingCountryCode: true,
        deliveryAddressLine1: true,
        deliveryAddressLine2: true,
        deliveryAddressLine3: true,
        deliveryAddressLine4: true,
        deliveryCity: true,
        deliveryPostCode: true,
        deliveryCountryCode: true,
        area: true,
        attention: true,
        contactPerson: true,
        emailCc: true,
        currency: true,
        agentId: true,
        natureOfBusiness: true,
        registrationIdType: true,
        registrationNo: true,
        taxIdentificationNo: true,
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
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        deliveryAddresses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            addressLine1: true,
            addressLine2: true,
            addressLine3: true,
            addressLine4: true,
            city: true,
            postCode: true,
            countryCode: true,
          },
        },
      accountSource: true,
      portalAccess: true,
      createdAt: true,
      orders: {
        where: orderWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          orderType: true,
          totalAmount: true,
          customGrandTotal: true,
          status: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return customers.map((customer) => {
    const validOrders = customer.orders.filter((order) => order.status !== "CANCELLED");
    const totalOrders = validOrders.length;
    const totalSpent = validOrders.reduce((sum, order) => {
      return sum + Number(order.orderType === "CUSTOM_ORDER" ? order.customGrandTotal || 0 : order.totalAmount || 0);
    }, 0);

    const lastOrderDate = totalOrders > 0 ? validOrders[0].createdAt : null;

    return {
      ...customer,
      orders: validOrders,
      totalOrders,
      totalSpent,
      lastOrderDate,
    };
  });
}

export async function getCustomerById(customerId: string) {
  return db.user.findFirst({
    where: {
      id: customerId,
      role: "CUSTOMER",
    },
    select: {
      id: true,
      name: true,
      customerAccountNo: true,
      email: true,
      phone: true,
        phone2: true,
        fax: true,
        billingAddressLine1: true,
        billingAddressLine2: true,
        billingAddressLine3: true,
        billingAddressLine4: true,
        billingCity: true,
        billingPostCode: true,
        billingCountryCode: true,
        deliveryAddressLine1: true,
        deliveryAddressLine2: true,
        deliveryAddressLine3: true,
        deliveryAddressLine4: true,
        deliveryCity: true,
        deliveryPostCode: true,
        deliveryCountryCode: true,
        area: true,
        attention: true,
        contactPerson: true,
        emailCc: true,
        currency: true,
        agentId: true,
        natureOfBusiness: true,
        registrationIdType: true,
        registrationNo: true,
        taxIdentificationNo: true,
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        deliveryAddresses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            addressLine1: true,
            addressLine2: true,
            addressLine3: true,
            addressLine4: true,
            city: true,
            postCode: true,
            countryCode: true,
          },
        },
      accountSource: true,
      portalAccess: true,
      createdAt: true,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });
}

export async function getCustomerByIdWithIntelligence(customerId: string) {
  const customer = await db.user.findFirst({
    where: {
      id: customerId,
      role: "CUSTOMER",
    },
    select: {
      id: true,
      name: true,
      customerAccountNo: true,
      email: true,
      phone: true,
        phone2: true,
        fax: true,
        billingAddressLine1: true,
        billingAddressLine2: true,
        billingAddressLine3: true,
        billingAddressLine4: true,
        billingCity: true,
        billingPostCode: true,
        billingCountryCode: true,
        deliveryAddressLine1: true,
        deliveryAddressLine2: true,
        deliveryAddressLine3: true,
        deliveryAddressLine4: true,
        deliveryCity: true,
        deliveryPostCode: true,
        deliveryCountryCode: true,
        area: true,
        attention: true,
        contactPerson: true,
        emailCc: true,
        currency: true,
        agentId: true,
        natureOfBusiness: true,
        registrationIdType: true,
        registrationNo: true,
        taxIdentificationNo: true,
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        deliveryAddresses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            addressLine1: true,
            addressLine2: true,
            addressLine3: true,
            addressLine4: true,
            city: true,
            postCode: true,
            countryCode: true,
          },
        },
      accountSource: true,
      portalAccess: true,
      createdAt: true,
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          orderType: true,
          customTitle: true,
          selectedTuneLabel: true,
          tuningType: true,
          totalAmount: true,
          customGrandTotal: true,
          vehicleNo: true,
          createdByAdminId: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) return null;

  const validOrders = customer.orders.filter((order) => order.status !== "CANCELLED");
  const totalOrders = validOrders.length;
  const totalSpent = validOrders.reduce((sum, order) => {
    return sum + Number(order.orderType === "CUSTOM_ORDER" ? order.customGrandTotal || 0 : order.totalAmount || 0);
  }, 0);

  const averageOrderValue = totalOrders > 0 ? Math.round((totalSpent / totalOrders) * 100) / 100 : 0;
  const lastOrderDate = totalOrders > 0 ? validOrders[0].createdAt : null;

  const creditControl = buildCustomerCreditControl(customer);

  return {
    ...customer,
    customerSalesTransactions: undefined,
    creditControl,
    intelligence: {
      totalOrders,
      totalSpent,
      averageOrderValue,
      lastOrderDate,
    },
  };
}
