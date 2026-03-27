import { db } from "@/lib/db";

export async function getProducts() {
  return db.product.findMany({ where: { isActive: true }, orderBy: { title: "asc" } });
}

export async function getRecentOrdersForUser(userId: string) {
  return db.order.findMany({
    where: { userId },
    include: { files: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllOrders() {
  return db.order.findMany({
    include: { user: true, files: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
}
