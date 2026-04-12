import { db } from "@/lib/db";

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

type OrderDocType = "CS" | "INV";

function getMalaysiaDateParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = formatter.format(date).split("-");

  return {
    year,
    month,
    day,
    dateStamp: `${year}${month}${day}`,
    monthStamp: `${year}${month}`,
  };
}

function getNextSequence(currentValue?: string | null) {
  const currentSequence = Number(String(currentValue || "").split("-").pop() || 0);
  return String(currentSequence + 1).padStart(4, "0");
}

export async function generateOrderDocumentNumber(docType: OrderDocType, date: Date = new Date()) {
  const { dateStamp, monthStamp } = getMalaysiaDateParts(date);

  const latestOrder = await db.order.findFirst({
    where: {
      docType,
      orderNumber: {
        startsWith: `${docType}-${monthStamp}`,
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { orderNumber: "desc" },
    ],
    select: {
      orderNumber: true,
    },
  });

  const nextSequence = getNextSequence(latestOrder?.orderNumber);
  return `${docType}-${dateStamp}-${nextSequence}`;
}

export async function generateCreditNoteDocumentNumber(date: Date = new Date()) {
  const { dateStamp, monthStamp } = getMalaysiaDateParts(date);

  const latestCreditNote = await db.creditNote.findFirst({
    where: {
      cnNo: {
        startsWith: `CN-${monthStamp}`,
      },
    },
    orderBy: [
      { cnDate: "desc" },
      { cnNo: "desc" },
    ],
    select: {
      cnNo: true,
    },
  });

  const nextSequence = getNextSequence(latestCreditNote?.cnNo);
  return `CN-${dateStamp}-${nextSequence}`;
}
