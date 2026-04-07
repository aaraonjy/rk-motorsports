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

  console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
