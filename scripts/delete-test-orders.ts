import { PrismaClient } from "@prisma/client";
import { del } from "@vercel/blob";

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      files: {
        select: {
          id: true,
          storagePath: true,
          fileName: true,
          kind: true,
        },
      },
    },
  });

  if (orders.length === 0) {
    console.log("No orders found.");
    return;
  }

  const orderIds = orders.map((order) => order.id);

  console.log(`Found ${orders.length} order(s).`);
  console.log(
    "Order numbers:",
    orders.map((o) => o.orderNumber).join(", ")
  );

  const blobPaths = orders
    .flatMap((order) => order.files)
    .map((file) => file.storagePath)
    .filter(Boolean);

  if (blobPaths.length > 0) {
    console.log(`Deleting ${blobPaths.length} blob file(s)...`);

    try {
      await del(blobPaths);
      console.log("Blob files deleted successfully.");
    } catch (error) {
      console.error("Failed to delete blob files:", error);
      throw error;
    }
  } else {
    console.log("No blob files found for these orders.");
  }

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

  console.log("Deleted all orders, order items, and uploaded files.");
}

main()
  .catch((error) => {
    console.error("Delete failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });