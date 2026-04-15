
import { PrismaClient, Role, AccountSource } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@rkmotorsports.com" },
    update: {
      name: "RK Admin",
      phone: "+60123456789",
      role: Role.ADMIN,
      accountSource: AccountSource.ADMIN,
      portalAccess: true,
    },
    create: {
      name: "RK Admin",
      email: "admin@rkmotorsports.com",
      phone: "+60123456789",
      passwordHash: adminHash,
      role: Role.ADMIN,
      accountSource: AccountSource.ADMIN,
      portalAccess: true,
    },
  });

  const defaultLocation = await prisma.stockLocation.upsert({
    where: { code: "MAIN" },
    update: {
      name: "Main Store",
      isActive: true,
    },
    create: {
      code: "MAIN",
      name: "Main Store",
      isActive: true,
    },
  });

  await prisma.taxConfiguration.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      taxModuleEnabled: false,
    },
  });

  await prisma.stockConfiguration.upsert({
    where: { id: "default" },
    update: {
      defaultLocationId: defaultLocation.id,
    },
    create: {
      id: "default",
      stockModuleEnabled: false,
      multiLocationEnabled: false,
      allowNegativeStock: false,
      costingMethod: "AVERAGE",
      multiUomEnabled: false,
      serialTrackingEnabled: false,
      defaultLocationId: defaultLocation.id,
    },
  });
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
