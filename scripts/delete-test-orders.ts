import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "test@gmail.com";

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      orders: {
        select: { id: true, orderNumber: true },
      },
    },
  });

  if (!user) {
    console.log(`User not found: ${email}`);
    return;
  }

  const orderIds = user.orders.map((order) => order.id);

  if (orderIds.length === 0) {
    console.log(`No orders found for ${email}`);
    return;
  }

  console.log(`Found ${orderIds.length} order(s) for ${email}`);
  console.log("Order numbers:", user.orders.map((o) => o.orderNumber).join(", "));

  await prisma.orderFile.deleteMany({
    where: {
      orderId: { in: orderIds },
    },
  });

  await prisma.orderItem.deleteMany({
    where: {
      orderId: { in: orderIds },
    },
  });

  await prisma.order.deleteMany({
    where: {
      id: { in: orderIds },
    },
  });

  console.log(`Deleted all orders for ${email}`);
}

main()
  .catch((error) => {
    console.error("Delete failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });