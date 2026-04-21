import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ExpectedState = {
  status: "IN_STOCK" | "OUT_OF_STOCK";
  currentLocationId: string | null;
  inventoryBatchId: string | null;
};

function makeKey(inventoryProductId: string, serialNo: string) {
  return `${inventoryProductId}__${serialNo.trim().toUpperCase()}`;
}

function resolveExpectedState(entry: any): ExpectedState | null {
  const tx = entry.transactionLine?.transaction;
  const line = entry.transactionLine;

  if (!tx || !line) return null;
  if (tx.status !== "POSTED") return null;

  const type = tx.transactionType as string;
  const dir = (line.adjustmentDirection as string | null) ?? null;

  if (type === "OB" || type === "SR" || ((type === "SA" || type === "AS") && dir === "IN")) {
    return {
      status: "IN_STOCK",
      currentLocationId: line.locationId ?? null,
      inventoryBatchId: entry.inventoryBatchId ?? null,
    };
  }

  if (type === "SI" || ((type === "SA" || type === "AS") && dir === "OUT")) {
    return {
      status: "OUT_OF_STOCK",
      currentLocationId: null,
      inventoryBatchId: entry.inventoryBatchId ?? null,
    };
  }

  if (type === "ST") {
    return {
      status: "IN_STOCK",
      currentLocationId: line.toLocationId ?? null,
      inventoryBatchId: entry.inventoryBatchId ?? null,
    };
  }

  return null;
}

async function main() {
  console.log("🔧 Rebuilding serial state from posted stock transaction serial entries...");

  const entries = await prisma.stockTransactionLineSerial.findMany({
    include: {
      transactionLine: {
        include: {
          transaction: true,
        },
      },
      inventoryBatch: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const latestBySerial = new Map<string, any>();

  for (const entry of entries) {
    const tx = entry.transactionLine?.transaction;
    if (!tx || tx.status !== "POSTED") continue;

    const key = makeKey(entry.inventoryProductId, entry.serialNo);
    const current = latestBySerial.get(key);

    if (!current) {
      latestBySerial.set(key, entry);
      continue;
    }

    const currentDate = new Date(current.transactionLine.transaction.transactionDate).getTime();
    const nextDate = new Date(entry.transactionLine.transaction.transactionDate).getTime();

    if (nextDate > currentDate) {
      latestBySerial.set(key, entry);
      continue;
    }

    if (nextDate === currentDate) {
      const currentCreated = new Date(current.createdAt).getTime();
      const nextCreated = new Date(entry.createdAt).getTime();
      if (nextCreated > currentCreated) {
        latestBySerial.set(key, entry);
      }
    }
  }

  let updatedSerials = 0;
  let createdSerials = 0;
  let linkedEntries = 0;

  for (const entry of latestBySerial.values()) {
    const expected = resolveExpectedState(entry);
    if (!expected) continue;

    const serialNo = entry.serialNo.trim();
    const inventoryProductId = entry.inventoryProductId;

    let serial = await prisma.inventorySerial.findUnique({
      where: {
        inventoryProductId_serialNo: {
          inventoryProductId,
          serialNo,
        },
      },
    });

    if (!serial && expected.status === "IN_STOCK") {
      serial = await prisma.inventorySerial.create({
        data: {
          inventoryProductId,
          serialNo,
          inventoryBatchId: expected.inventoryBatchId,
          currentLocationId: expected.currentLocationId,
          status: expected.status,
        },
      });
      createdSerials += 1;
      console.log(`➕ Created missing serial ${serialNo} -> ${expected.status} @ ${expected.currentLocationId ?? "NULL"}`);
    }

    if (!serial) continue;

    const needsUpdate =
      serial.status !== expected.status ||
      serial.currentLocationId !== expected.currentLocationId ||
      (expected.inventoryBatchId && serial.inventoryBatchId !== expected.inventoryBatchId);

    if (needsUpdate) {
      await prisma.inventorySerial.update({
        where: { id: serial.id },
        data: {
          status: expected.status,
          currentLocationId: expected.currentLocationId,
          inventoryBatchId: expected.inventoryBatchId ?? serial.inventoryBatchId,
        },
      });
      updatedSerials += 1;
      console.log(`🛠 Fixed ${serialNo}: status=${expected.status}, location=${expected.currentLocationId ?? "NULL"}`);
    }

    if (entry.inventorySerialId !== serial.id || (expected.inventoryBatchId && entry.inventoryBatchId !== expected.inventoryBatchId)) {
      await prisma.stockTransactionLineSerial.update({
        where: { id: entry.id },
        data: {
          inventorySerialId: serial.id,
          inventoryBatchId: expected.inventoryBatchId ?? entry.inventoryBatchId,
        },
      });
      linkedEntries += 1;
      console.log(`🔗 Linked entry ${entry.id} -> ${serialNo}`);
    }
  }

  console.log("");
  console.log("✅ Repair completed");
  console.log(`Updated serial rows : ${updatedSerials}`);
  console.log(`Created serial rows : ${createdSerials}`);
  console.log(`Linked line entries : ${linkedEntries}`);
}

main()
  .catch((error) => {
    console.error("❌ Repair failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
