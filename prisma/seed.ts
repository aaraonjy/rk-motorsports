import { PrismaClient, ProductType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const customerHash = await bcrypt.hash("customer123", 10);

  await prisma.user.upsert({
    where: { email: "admin@rkmotorsports.com" },
    update: {
      name: "RK Admin",
      phone: "+60123456789",
      role: Role.ADMIN,
    },
    create: {
      name: "RK Admin",
      email: "admin@rkmotorsports.com",
      phone: "+60123456789",
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {
      name: "Demo Customer",
      phone: "+60111222333",
    },
    create: {
      name: "Demo Customer",
      email: "customer@example.com",
      phone: "+60111222333",
      passwordHash: customerHash,
    },
  });

  const vw = await prisma.vehicleBrand.upsert({
    where: { slug: "volkswagen" },
    update: { name: "Volkswagen" },
    create: { name: "Volkswagen", slug: "volkswagen" },
  });

  const mazda = await prisma.vehicleBrand.upsert({
    where: { slug: "mazda" },
    update: { name: "Mazda" },
    create: { name: "Mazda", slug: "mazda" },
  });

  const gti = await prisma.vehicleModel.upsert({
    where: { brandId_slug: { brandId: vw.id, slug: "mk7-gti" } },
    update: { name: "MK7 GTI" },
    create: { name: "MK7 GTI", slug: "mk7-gti", brandId: vw.id },
  });

  const mps = await prisma.vehicleModel.upsert({
    where: { brandId_slug: { brandId: mazda.id, slug: "mazda-3-mps" } },
    update: { name: "Mazda 3 MPS" },
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

  const existingMg1 = await prisma.ecuType.findFirst({
    where: {
      vehicleYearId: gtiYear.id,
      name: "Bosch MG1",
    },
  });

  if (existingMg1) {
    await prisma.ecuType.update({
      where: { id: existingMg1.id },
      data: {
        manufacturer: "Bosch",
        protocol: "Bench/OBD",
      },
    });
  } else {
    await prisma.ecuType.create({
      data: {
        name: "Bosch MG1",
        manufacturer: "Bosch",
        protocol: "Bench/OBD",
        vehicleYearId: gtiYear.id,
      },
    });
  }

  const existingMed17 = await prisma.ecuType.findFirst({
    where: {
      vehicleYearId: mpsYear.id,
      name: "Bosch MED17",
    },
  });

  if (existingMed17) {
    await prisma.ecuType.update({
      where: { id: existingMed17.id },
      data: {
        manufacturer: "Bosch",
        protocol: "OBD",
      },
    });
  } else {
    await prisma.ecuType.create({
      data: {
        name: "Bosch MED17",
        manufacturer: "Bosch",
        protocol: "OBD",
        vehicleYearId: mpsYear.id,
      },
    });
  }

  const products = [
    {
      title: "Stage 1 ECU Tune",
      slug: "stage-1-ecu-tune",
      description: "Balanced daily performance calibration.",
      type: ProductType.SERVICE,
      basePrice: 1500,
      isActive: true,
    },
    {
      title: "Stage 2 ECU Tune",
      slug: "stage-2-ecu-tune",
      description: "Performance calibration for upgraded hardware.",
      type: ProductType.SERVICE,
      basePrice: 2200,
      isActive: true,
    },
    {
      title: "Custom File Service",
      slug: "custom-file-service",
      description: "Upload your original ECU file and receive a custom tuned file.",
      type: ProductType.CUSTOM_TUNE,
      basePrice: 1800,
      isActive: true,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        title: product.title,
        description: product.description,
        type: product.type,
        basePrice: product.basePrice,
        isActive: product.isActive,
      },
      create: product,
    });
  }

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