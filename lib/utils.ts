import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function generateOrderNumber() {
  const d = new Date();
  const p = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const r = Math.floor(1000 + Math.random() * 9000);
  return `RK-${p}-${r}`;
}

function getMalaysiaDateStamp(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date).replaceAll("-", "");
}

export function generateCreditNoteNumber(date: Date = new Date()) {
  const p = getMalaysiaDateStamp(date);
  const r = Math.floor(1000 + Math.random() * 9000);
  return `RK-CN-${p}-${r}`;
}
