import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PurchaseDocType } from "@prisma/client";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ success?: string; error?: string }> };

const DOC_TYPE = "GRN" as PurchaseDocType;
const TITLE = "Goods Received Note";
const TITLE_LOWER = "goods received note";
const LIST_PATH = "/admin/purchase/goods-received-note";
const SUMMARY_TITLE = "Goods Received Note Summary";
const PRODUCT_NOTE = "Invoice progress will be updated by future Purchase Invoice documents using line-level links.";

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(/am|pm/i, (value) => value.toLowerCase());
}

function getPurchaseRouteByDocType(docType: string | null | undefined) {
  const value = String(docType || "").toUpperCase();
  if (value === "PO") return "purchase-order";
  if (value === "GRN") return "goods-received-note";
  if (value === "PI") return "purchase-invoice";
  return "";
}

function isActivePurchaseTrace(status: string | null | undefined) {
  return String(status || "").toUpperCase() !== "CANCELLED";
}

function getLinkedQty(
  line: { sourceLineLinks?: Array<{ linkType?: string | null; qty?: unknown; targetTransaction?: { status?: string | null } | null }> },
  linkType: "RECEIVED_TO" | "INVOICED_TO",
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => isActivePurchaseTrace(link.targetTransaction?.status))
    .reduce((sum, link) => sum + toNumber(link.qty), 0);
}

function getLinkedAmount(
  line: { sourceLineLinks?: Array<{ linkType?: string | null; claimAmount?: unknown; targetTransaction?: { status?: string | null } | null }> },
  linkType: "RECEIVED_TO" | "INVOICED_TO",
) {
  return (line.sourceLineLinks || [])
    .filter((link) => link.linkType === linkType)
    .filter((link) => isActivePurchaseTrace(link.targetTransaction?.status))
    .reduce((sum, link) => sum + toNumber(link.claimAmount), 0);
}


type PurchaseTrackingMeta = {
  batchNo: string | null;
  expiryDate: string | null;
  serialNos: string[];
};

function normalizeTrackingText(value: unknown) {
  return String(value || "").trim();
}

function normalizeTrackingKey(value: unknown) {
  return normalizeTrackingText(value).toUpperCase();
}

function uniqueTrackingSerialNos(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = normalizeTrackingText(value);
    if (!text) continue;
    const key = text.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function formatTrackingDateInput(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function findMatchingStockTrackingLine(
  stockLines: Array<{
    inventoryProductId?: string | null;
    locationId?: string | null;
    batchNo?: string | null;
    expiryDate?: Date | string | null;
    serialEntries?: Array<{ serialNo?: string | null }>;
  }>,
  line: {
    inventoryProductId?: string | null;
    locationId?: string | null;
    batchNo?: string | null;
  },
) {
  const productId = normalizeTrackingText(line.inventoryProductId);
  const locationId = normalizeTrackingText(line.locationId);
  const batchNo = normalizeTrackingKey(line.batchNo);

  return stockLines.find((stockLine) => {
    if (normalizeTrackingText(stockLine.inventoryProductId) !== productId) return false;
    if (locationId && normalizeTrackingText(stockLine.locationId) !== locationId) return false;
    if (batchNo && normalizeTrackingKey(stockLine.batchNo) !== batchNo) return false;
    return true;
  }) || null;
}

async function buildPurchaseTrackingByLine(transactions: any[]) {
  const stockTransactionIds = new Set<string>();
  const batchLookupKeys = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.stockTransactionId) stockTransactionIds.add(transaction.stockTransactionId);
    if (transaction.revisedFrom?.stockTransactionId) stockTransactionIds.add(transaction.revisedFrom.stockTransactionId);

    for (const line of transaction.lines || []) {
      const productId = normalizeTrackingText(line.inventoryProductId);
      const batchNo = normalizeTrackingKey(line.batchNo);
      if (productId && batchNo) batchLookupKeys.add(`${productId}__${batchNo}`);

      for (const link of line.targetLineLinks || []) {
        const sourceStockTransactionId = link.sourceLine?.transaction?.stockTransactionId;
        if (sourceStockTransactionId) stockTransactionIds.add(sourceStockTransactionId);
      }
    }

    for (const originalLine of transaction.revisedFrom?.lines || []) {
      for (const link of originalLine.targetLineLinks || []) {
        const sourceStockTransactionId = link.sourceLine?.transaction?.stockTransactionId;
        if (sourceStockTransactionId) stockTransactionIds.add(sourceStockTransactionId);
      }
    }
  }

  const stockTransactions = stockTransactionIds.size > 0
    ? await db.stockTransaction.findMany({
        where: { id: { in: Array.from(stockTransactionIds) } },
        include: {
          lines: {
            orderBy: { createdAt: "asc" },
            include: { serialEntries: { orderBy: { createdAt: "asc" } } },
          },
        },
      })
    : [];

  const stockLinesByTransactionId = new Map<string, typeof stockTransactions[number]["lines"]>();
  for (const stockTransaction of stockTransactions) {
    stockLinesByTransactionId.set(stockTransaction.id, stockTransaction.lines);
  }

  const batchLookupConditions = Array.from(batchLookupKeys).map((key) => {
    const [inventoryProductId, batchNo] = key.split("__");
    return { inventoryProductId, batchNo };
  });
  const batchRecords = batchLookupConditions.length > 0
    ? await db.inventoryBatch.findMany({
        where: { OR: batchLookupConditions },
        select: { inventoryProductId: true, batchNo: true, expiryDate: true },
      })
    : [];
  const expiryDateByBatchKey = new Map<string, string | null>();
  for (const batch of batchRecords) {
    expiryDateByBatchKey.set(
      `${normalizeTrackingText(batch.inventoryProductId)}__${normalizeTrackingKey(batch.batchNo)}`,
      formatTrackingDateInput(batch.expiryDate),
    );
  }

  const trackingByLine = new Map<string, PurchaseTrackingMeta>();
  for (const transaction of transactions) {
    for (const line of transaction.lines || []) {
      const revisedFromStockTransactionIds = [
        transaction.revisedFrom?.stockTransactionId,
        ...((transaction.revisedFrom?.lines || [])
          .flatMap((originalLine: any) => originalLine.targetLineLinks || [])
          .map((link: any) => link.sourceLine?.transaction?.stockTransactionId)
          .filter(Boolean) as string[]),
      ];
      const candidateStockTransactionIds = [
        transaction.stockTransactionId,
        ...((line.targetLineLinks || [])
          .map((link: any) => link.sourceLine?.transaction?.stockTransactionId)
          .filter(Boolean) as string[]),
        ...revisedFromStockTransactionIds,
      ];

      for (const stockTransactionId of candidateStockTransactionIds) {
        if (!stockTransactionId) continue;
        const stockLines = stockLinesByTransactionId.get(stockTransactionId) || [];
        const stockLine = findMatchingStockTrackingLine(stockLines, line);
        if (!stockLine) continue;
        const serialNos = uniqueTrackingSerialNos((stockLine.serialEntries || []).map((entry) => entry.serialNo));
        const batchKey = `${normalizeTrackingText(stockLine.inventoryProductId)}__${normalizeTrackingKey(stockLine.batchNo || line.batchNo)}`;
        trackingByLine.set(`${transaction.id}__${line.id}`, {
          batchNo: stockLine.batchNo || line.batchNo || null,
          expiryDate: formatTrackingDateInput(stockLine.expiryDate) || expiryDateByBatchKey.get(batchKey) || null,
          serialNos,
        });
        break;
      }

      const lineKey = `${transaction.id}__${line.id}`;
      if (!trackingByLine.has(lineKey) && line.batchNo) {
        const batchKey = `${normalizeTrackingText(line.inventoryProductId)}__${normalizeTrackingKey(line.batchNo)}`;
        trackingByLine.set(lineKey, {
          batchNo: line.batchNo,
          expiryDate: expiryDateByBatchKey.get(batchKey) || null,
          serialNos: [],
        });
      }
    }
  }

  return trackingByLine;
}

function ReadonlyField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label-rk">{label}</label>
      <input className="input-rk" value={value} readOnly disabled />
    </div>
  );
}

function ReadonlyTextArea({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label-rk">{label}</label>
      <textarea className="input-rk min-h-[96px] resize-none" value={value} readOnly disabled />
    </div>
  );
}

function AddressPanel({
  title,
  address,
}: {
  title: string;
  address: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    addressLine3?: string | null;
    addressLine4?: string | null;
    city?: string | null;
    postCode?: string | null;
  };
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ReadonlyField label="Address Line 1" value={address.addressLine1 || ""} />
        <ReadonlyField label="Address Line 2" value={address.addressLine2 || ""} />
        <ReadonlyField label="Address Line 3" value={address.addressLine3 || ""} />
        <ReadonlyField label="Address Line 4" value={address.addressLine4 || ""} />
        <ReadonlyField label="City" value={address.city || ""} />
        <ReadonlyField label="Post Code" value={address.postCode || ""} />
      </div>
    </div>
  );
}

export default async function PurchaseDetailPage({ params, searchParams }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const successMessage = typeof resolvedSearchParams?.success === "string" ? resolvedSearchParams.success.trim() : "";
  const errorMessage = typeof resolvedSearchParams?.error === "string" ? resolvedSearchParams.error.trim() : "";

  const transaction = await db.purchaseTransaction.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, code: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true, projectId: true } },
      revisedFrom: {
        select: {
          id: true,
          docNo: true,
          stockTransactionId: true,
          lines: {
            orderBy: { lineNo: "asc" },
            select: {
              id: true,
              inventoryProductId: true,
              locationId: true,
              batchNo: true,
              targetLineLinks: {
                include: {
                  sourceLine: {
                    select: {
                      id: true,
                      inventoryProductId: true,
                      locationId: true,
                      batchNo: true,
                      transaction: { select: { id: true, stockTransactionId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      revisions: { select: { id: true, docNo: true, status: true } },
      sourceLinks: {
        include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } } },
      },
      targetLinks: {
        include: { sourceTransaction: { select: { id: true, docType: true, docNo: true, status: true } } },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          sourceLineLinks: {
            include: { targetTransaction: { select: { id: true, docType: true, docNo: true, status: true } } },
          },
          targetLineLinks: {
            include: {
              sourceLine: {
                select: {
                  id: true,
                  inventoryProductId: true,
                  locationId: true,
                  batchNo: true,
                  transaction: { select: { id: true, stockTransactionId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!transaction || transaction.docType !== DOC_TYPE) {
    return (
      <section className="section-pad">
        <div className="container-rk max-w-5xl">
          <p className="text-white/70">{TITLE} not found.</p>
        </div>
      </section>
    );
  }

  const trackingByLine = await buildPurchaseTrackingByLine([transaction as any]);

  const createdAdmin = await db.user.findUnique({
    where: { id: transaction.createdByAdminId },
    select: { name: true, email: true },
  });
  const cancelledAdmin = transaction.cancelledByAdminId
    ? await db.user.findUnique({
        where: { id: transaction.cancelledByAdminId },
        select: { name: true, email: true },
      })
    : null;
  const createdByName = createdAdmin?.name || createdAdmin?.email || "-";
  const cancelledByName = cancelledAdmin?.name || cancelledAdmin?.email || "-";
  const currency = transaction.currency || "MYR";
  const activeGeneratedFromDocuments = transaction.targetLinks
    .map((link) => link.sourceTransaction)
    .filter((item) => item && isActivePurchaseTrace(item.status));
  const activeGeneratedToDocuments = transaction.sourceLinks
    .map((link) => link.targetTransaction)
    .filter((item) => item && isActivePurchaseTrace(item.status));
  const canEdit = transaction.status !== "CANCELLED" && activeGeneratedFromDocuments.length === 0;

  const billingAddress = {
    addressLine1: transaction.billingAddressLine1,
    addressLine2: transaction.billingAddressLine2,
    addressLine3: transaction.billingAddressLine3,
    addressLine4: transaction.billingAddressLine4,
    city: transaction.billingCity,
    postCode: transaction.billingPostCode,
  };
  const deliveryAddress = {
    addressLine1: transaction.deliveryAddressLine1,
    addressLine2: transaction.deliveryAddressLine2,
    addressLine3: transaction.deliveryAddressLine3,
    addressLine4: transaction.deliveryAddressLine4,
    city: transaction.deliveryCity,
    postCode: transaction.deliveryPostCode,
  };

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl space-y-6">
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">{TITLE}</p>
            <h1 className="mt-3 text-4xl font-bold">{transaction.docNo}</h1>
            <p className="mt-4 max-w-3xl text-white/70">View {TITLE_LOWER} details in read-only mode.</p>
            {activeGeneratedFromDocuments.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-sky-200">Generated from:</span>
                {activeGeneratedFromDocuments.map((source, index) => {
                  const route = getPurchaseRouteByDocType(source?.docType);
                  const content = `${source?.docNo || "-"}${activeGeneratedFromDocuments.length > 1 && index < activeGeneratedFromDocuments.length - 1 ? "," : ""}`;
                  return route ? (
                    <Link key={source?.id} href={`/admin/purchase/${route}/${source?.id}`} className="text-sky-200 underline-offset-4 hover:underline">
                      {content}
                    </Link>
                  ) : (
                    <span key={source?.id} className="text-sky-200">{content}</span>
                  );
                })}
              </div>
            ) : null}
            {activeGeneratedToDocuments.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-sky-200">Generated to:</span>
                {activeGeneratedToDocuments.map((target, index) => {
                  const route = getPurchaseRouteByDocType(target?.docType);
                  const content = `${target?.docNo || "-"}${activeGeneratedToDocuments.length > 1 && index < activeGeneratedToDocuments.length - 1 ? "," : ""}`;
                  return route ? (
                    <Link key={target?.id} href={`/admin/purchase/${route}/${target?.id}`} className="text-sky-200 underline-offset-4 hover:underline">
                      {content}
                    </Link>
                  ) : (
                    <span key={target?.id} className="text-sky-200">{content}</span>
                  );
                })}
              </div>
            ) : null}
            {transaction.revisedFrom?.docNo ? (
              <Link href={`${LIST_PATH}/${transaction.revisedFrom.id}`} className="mt-3 block w-fit rounded-lg px-2 py-1 text-sm text-white/45 transition hover:bg-white/5 hover:text-white/80">
                ↳ Revision of {transaction.revisedFrom.docNo}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={LIST_PATH} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">
              Back
            </Link>
            <Link
              href={`${LIST_PATH}?edit=${transaction.id}`}
              className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                !canEdit
                  ? "pointer-events-none cursor-not-allowed border border-white/10 bg-white/5 opacity-50"
                  : "border border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              Edit
            </Link>
          </div>
        </div>

        {transaction.status === "CANCELLED" ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-100">
            <div className="font-semibold">This {TITLE_LOWER} has been cancelled.</div>
            <div className="mt-2">Cancelled At: {formatDate(transaction.cancelledAt)}</div>
            <div className="mt-1">Cancelled By: {cancelledByName}</div>
            <div className="mt-1">Reason: {transaction.cancelReason || "-"}</div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-black/45 p-5 backdrop-blur-md md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/40">{TITLE}</p>
              <h2 className="mt-4 text-4xl font-bold">View {TITLE}</h2>
              <p className="mt-4 max-w-3xl text-white/70">Use the same purchase document layout in read-only mode for easier review and checking.</p>
            </div>
            <div className="grid min-w-[250px] grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs text-white/55">
              <div className="text-right">Created By:</div>
              <div className="text-left font-semibold text-white/75">{createdByName}</div>
              <div className="text-right">Created Date:</div>
              <div className="text-left font-semibold text-white/75">{formatDateTime(transaction.createdAt)}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <ReadonlyField label="Doc Date" value={formatDate(transaction.docDate)} />
            <ReadonlyField label="System Doc No" value={transaction.docNo} className="xl:col-span-3" />
            <ReadonlyField label="A/C No" value={transaction.supplierAccountNo || ""} />
            <ReadonlyField label="Supplier Name" value={transaction.supplierName || ""} />
            <ReadonlyField label="Email" value={transaction.email || ""} />
            <ReadonlyField label="Status" value={transaction.status} />
            <ReadonlyField label="Document Description" value={transaction.docDesc || ""} className="xl:col-span-2" />
            <ReadonlyField label="Attention" value={transaction.attention || ""} />
            <ReadonlyField label="Contact No" value={transaction.contactNo || ""} />
            <ReadonlyField label="Agent" value={transaction.agent ? `${transaction.agent.code} — ${transaction.agent.name}` : ""} />
            {transaction.project ? <ReadonlyField label="Project" value={`${transaction.project.code} — ${transaction.project.name}`} /> : null}
            {transaction.department ? <ReadonlyField label="Department" value={`${transaction.department.code} — ${transaction.department.name}`} /> : null}
          </div>

          <div className="mt-6">
            <AddressPanel title="Billing Address" address={billingAddress} />
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <ReadonlyTextArea label="Remarks" value={transaction.remarks || ""} />
            <ReadonlyTextArea label="Footer Remarks" value={transaction.footerRemarks || ""} />
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 p-4">
            <h3 className="text-lg font-bold">Products</h3>
            <p className="mt-2 text-xs text-white/45">{PRODUCT_NOTE}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="text-left text-white/45">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">UOM</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    {DOC_TYPE === "PO" ? <th className="px-4 py-3 text-right">Received</th> : null}
                    {DOC_TYPE === "PO" ? <th className="px-4 py-3 text-right">Remaining GRN</th> : null}
                    {DOC_TYPE !== "PI" ? <th className="px-4 py-3 text-right">Invoiced</th> : null}
                    {DOC_TYPE !== "PI" ? <th className="px-4 py-3 text-right">Remaining PI</th> : null}
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Tax Code</th>
                    <th className="px-4 py-3 text-right">Product Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white/80">
                  {transaction.lines.length === 0 ? (
                    <tr><td colSpan={DOC_TYPE === "PI" ? 8 : DOC_TYPE === "PO" ? 12 : 10} className="px-4 py-8 text-center text-white/50">No product line found.</td></tr>
                  ) : (
                    transaction.lines.map((line) => {
                      const isServiceItem = line.itemType === "SERVICE_ITEM";
                      const receivedQty = getLinkedQty(line, "RECEIVED_TO");
                      const receivedAmount = getLinkedAmount(line, "RECEIVED_TO");
                      const invoicedQty = getLinkedQty(line, "INVOICED_TO");
                      const invoicedAmount = getLinkedAmount(line, "INVOICED_TO");
                      const trackingMeta = trackingByLine.get(`${transaction.id}__${line.id}`);
                      return (
                        <tr key={line.id}>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-white">{line.productCode}</div>
                            <div className="mt-1 text-xs text-white/50">{line.productDescription}</div>
                            {(trackingMeta?.batchNo || line.batchNo) ? (
                              <div className="mt-1 text-xs text-amber-100/80">
                                Batch No: {trackingMeta?.batchNo || line.batchNo}
                                {trackingMeta?.expiryDate ? ` (Expiry Date: ${formatDate(trackingMeta.expiryDate)})` : ""}
                              </div>
                            ) : null}
                            {trackingMeta?.serialNos.length ? (
                              <div className="mt-1 text-xs text-white/75">S/N No: {trackingMeta.serialNos.join(", ")}</div>
                            ) : null}
                            {line.remarks ? <div className="mt-2 text-xs text-white/40">Remarks: {line.remarks}</div> : null}
                          </td>
                          <td className="px-4 py-4">{line.uom}</td>
                          <td className="px-4 py-4 text-right">{money(line.qty)}</td>
                          {DOC_TYPE === "PO" ? <td className="px-4 py-4 text-right">{isServiceItem ? money(receivedAmount) : money(receivedQty)}</td> : null}
                          {DOC_TYPE === "PO" ? <td className="px-4 py-4 text-right">{isServiceItem ? money(Math.max(0, toNumber(line.lineTotal) - receivedAmount)) : money(Math.max(0, toNumber(line.qty) - receivedQty))}</td> : null}
                          {DOC_TYPE !== "PI" ? <td className="px-4 py-4 text-right">{isServiceItem ? money(invoicedAmount) : money(invoicedQty)}</td> : null}
                          {DOC_TYPE !== "PI" ? <td className="px-4 py-4 text-right">{isServiceItem ? money(Math.max(0, toNumber(line.lineTotal) - invoicedAmount)) : money(Math.max(0, toNumber(line.qty) - invoicedQty))}</td> : null}
                          <td className="px-4 py-4 text-right">{money(line.unitCost)}</td>
                          <td className="px-4 py-4 text-right">{line.discountType === "AMOUNT" ? `${currency} ${money(line.discountAmount)}` : `${money(line.discountRate)}%`}</td>
                          <td className="px-4 py-4">{line.locationCode ? `${line.locationCode} — ${line.locationName || ""}` : "-"}</td>
                          <td className="px-4 py-4">{line.taxCode || "-"}</td>
                          <td className="px-4 py-4 text-right">{money(line.lineTotal)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <ReadonlyTextArea label="Terms & Conditions" value={transaction.termsAndConditions || ""} />
              <ReadonlyTextArea label="Bank Account" value={transaction.bankAccount || ""} />
            </div>
            <div className="rounded-[1.5rem] border border-white/10 p-5">
              <h3 className="text-xl font-bold">{SUMMARY_TITLE}</h3>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-white/65">Subtotal</span><span>{money(transaction.subtotal)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/65">Discount</span><span>{money(transaction.discountTotal)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/65">Tax</span><span>{money(transaction.taxTotal)}</span></div>
                <div className="border-t border-white/10 pt-4">
                  <div className="flex justify-between gap-4 text-xl font-bold">
                    <span>Grand Total ({currency})</span>
                    <span>{money(transaction.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {transaction.revisions.length > 0 ? (
            <div className="mt-8 rounded-[1.5rem] border border-white/10 p-4">
              <h3 className="text-lg font-bold">Revision History</h3>
              <div className="mt-3 space-y-2">
                {transaction.revisions.map((revision) => (
                  <Link key={revision.id} href={`${LIST_PATH}/${revision.id}`} className="block rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">
                    ↳ Revised to {revision.docNo} ({revision.status})
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
