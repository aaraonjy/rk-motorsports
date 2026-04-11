import { PrismaClient } from "@prisma/client";
import { del } from "@vercel/blob";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting dummy data cleanup...");
  console.log("This script keeps ADMIN users and deletes transactional dummy data plus CUSTOMER users.");

  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true, name: true },
  });

  console.log(`Found ${adminUsers.length} admin user(s). These will be preserved.`);
  if (adminUsers.length > 0) {
    console.log(
      "Admin accounts kept:",
      adminUsers.map((user) => `${user.name} <${user.email}>`).join(", ")
    );
  }

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

  console.log(`Found ${orders.length} order(s) to delete.`);

  const blobPaths = orders
    .flatMap((order) => order.files)
    .map((file) => file.storagePath)
    .filter((value): value is string => Boolean(value));

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
    console.log("No blob files found.");
  }

  await prisma.$transaction(async (tx) => {
    const deletedCreditNoteItems = await tx.creditNoteItem.deleteMany({});
    console.log(`Deleted CreditNoteItem: ${deletedCreditNoteItems.count}`);

    const deletedOrderRevisions = await tx.orderRevision.deleteMany({});
    console.log(`Deleted OrderRevision: ${deletedOrderRevisions.count}`);

    const deletedPayments = await tx.payment.deleteMany({});
    console.log(`Deleted Payment: ${deletedPayments.count}`);

    const deletedCustomOrderItems = await tx.customOrderItem.deleteMany({});
    console.log(`Deleted CustomOrderItem: ${deletedCustomOrderItems.count}`);

    const deletedOrderItems = await tx.orderItem.deleteMany({});
    console.log(`Deleted OrderItem: ${deletedOrderItems.count}`);

    const deletedOrderFiles = await tx.orderFile.deleteMany({});
    console.log(`Deleted OrderFile: ${deletedOrderFiles.count}`);

    const deletedCreditNotes = await tx.creditNote.deleteMany({});
    console.log(`Deleted CreditNote: ${deletedCreditNotes.count}`);

    const deletedNotifications = await tx.notification.deleteMany({});
    console.log(`Deleted Notification: ${deletedNotifications.count}`);

    const deletedOrders = await tx.order.deleteMany({});
    console.log(`Deleted Order: ${deletedOrders.count}`);

    const deletedCustomers = await tx.user.deleteMany({
      where: { role: "CUSTOMER" },
    });
    console.log(`Deleted CUSTOMER users: ${deletedCustomers.count}`);
  });

  console.log("Dummy data cleanup completed successfully.");
  console.log("ADMIN users were preserved.");
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
