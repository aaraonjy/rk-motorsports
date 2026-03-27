import { PrismaClient, ProductType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const customerHash = await bcrypt.hash("customer123", 10);

  await prisma.user.upsert({
    where: { email: "admin@rkmotorsports.com" },
    update: {},
    create: {
      name: "RK Admin",
      email: "admin@rkmotorsports.com",
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      name: "Demo Customer",
      email: "customer@example.com",
      passwordHash: customerHash,
    },
  });

  const vw = await prisma.vehicleBrand.upsert({
    where: { slug: "volkswagen" },
    update: {},
    create: { name: "Volkswagen", slug: "volkswagen" },
  });

  const mazda = await prisma.vehicleBrand.upsert({
    where: { slug: "mazda" },
    update: {},
    create: { name: "Mazda", slug: "mazda" },
  });

  const gti = await prisma.vehicleModel.upsert({
    where: { brandId_slug: { brandId: vw.id, slug: "mk7-gti" } },
    update: {},
    create: { name: "MK7 GTI", slug: "mk7-gti", brandId: vw.id },
  });

  const mps = await prisma.vehicleModel.upsert({
    where: { brandId_slug: { brandId: mazda.id, slug: "mazda-3-mps" } },
    update: {},
    create: { name: "Mazda 3 MPS", slug: "mazda-3-mps", brandId: mazda.id },
  });

  const gtiYear = await prisma.vehicleYear.upsert({
    where: { modelId_year: { modelId: gti.id, year: 2018 } },
    update: {},
    create: { modelId: gti.id, year: 2018 },
  });

  const mpsYear = await prisma.vehicleYear.upsert({
    where: { modelId_year: { modelId: mps.id, year: 2011 } },
    update: {},
    create: { modelId: mps.id, year: 2011 },
  });

  await prisma.ecuType.createMany({
    data: [
      { name: "Bosch MG1", manufacturer: "Bosch", protocol: "Bench/OBD", vehicleYearId: gtiYear.id },
      { name: "Bosch MED17", manufacturer: "Bosch", protocol: "OBD", vehicleYearId: mpsYear.id },
    ],
    skipDuplicates: true,
  });

  const products = [
    {
      title: "Stage 1 ECU Tune",
      slug: "stage-1-ecu-tune",
      description: "Balanced daily performance calibration.",
      type: ProductType.SERVICE,
      basePrice: 1500,
    },
    {
      title: "Stage 2 ECU Tune",
      slug: "stage-2-ecu-tune",
      description: "Performance calibration for upgraded hardware.",
      type: ProductType.SERVICE,
      basePrice: 2200,
    },
    {
      title: "Custom File Service",
      slug: "custom-file-service",
      description: "Upload your original ECU file and receive a custom tuned file.",
      type: ProductType.CUSTOM_TUNE,
      basePrice: 1800,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: product,
    });
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
