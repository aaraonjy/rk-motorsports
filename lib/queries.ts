import { db } from "@/lib/db";

export async function getProducts() {
  return db.product.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
  });
}

export async function getRecentOrdersForUser(userId: string) {
  return db.order.findMany({
    where: { userId },
    include: { files: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllOrders(filters?: {
  status?: string;
  search?: string;
}) {
  const where = {
    ...(filters?.status && filters.status !== "ALL"
      ? { status: filters.status }
      : {}),
    ...(filters?.search
      ? {
          orderNumber: {
            contains: filters.search,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  return db.order.findMany({
    where,
    include: {
      user: true,
      files: true,
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}