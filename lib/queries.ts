import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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

type AllOrdersOptions = {
  status?: string;
  search?: string;
  customerKeyword?: string;
  tuningType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export async function getAllOrders(filters?: AllOrdersOptions) {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(1, filters?.pageSize ?? 5);
  const skip = (page - 1) * pageSize;

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

  const where: Prisma.OrderWhereInput = {
    ...(filters?.status && filters.status !== "ALL"
      ? { status: filters.status as any }
      : {}),
    ...(filters?.search
      ? {
          orderNumber: {
            contains: filters.search,
            mode: "insensitive",
          },
        }
      : {}),
    ...(filters?.customerKeyword
      ? {
          user: {
            OR: [
              {
                name: {
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
        }
      : {}),
    ...(filters?.tuningType && filters.tuningType !== "ALL"
      ? { tuningType: filters.tuningType as any }
      : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };

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
        email: true,
        phone: true,
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
    customers,
    totalCount,
    currentPage: page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
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
      email: true,
      phone: true,
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
