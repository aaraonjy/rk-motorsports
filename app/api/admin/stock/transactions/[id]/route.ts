import { NextResponse } from "next/server";
import { StockAdjustmentDirection, StockTransactionType } from "@prisma/client";
import { requireAdmin, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLogFromRequest } from "@/lib/audit";
import {
  acquireStockMutationLocks,
  acquireAdvisoryLock,
  assertPositiveQty,
  buildLedgerValues,
  createStoredMoneyDecimal,
  createStoredQtyDecimal,
  buildDocumentNumberLockKey,
  buildTransactionEntityLockKey,
  buildTransactionNumberLockKey,
  generateStockDocumentNumber,
  generateStockTransactionNumber,
  assertValidDocumentNo,
  canOverrideDocumentNo,
  getStockBalance,
  normalizeStockDate,
} from "@/lib/stock";
import {
  normalizeMoneyDecimalPlaces,
  normalizeQtyDecimalPlaces,
  parseNonNegativeNumberWithDecimalPlaces,
  roundToDecimalPlaces,
  STOCK_STORAGE_DECIMAL_PLACES,
} from "@/lib/stock-format";

type Params = { params: Promise<{ id: string }> };

class NegativeStockAuthorizationError extends Error {
  code: string;
  details: Array<{ inventoryProductId: string; locationId: string; batchNo?: string | null; balance: number; requiredQty: number; message: string }>;

  constructor(
    message: string,
    details: Array<{ inventoryProductId: string; locationId: string; batchNo?: string | null; balance: number; requiredQty: number; message: string }>,
    code = "NEGATIVE_STOCK_AUTH_REQUIRED"
  ) {
    super(message);
    this.name = "NegativeStockAuthorizationError";
    this.code = code;
    this.details = details;
  }
}

async function resolveNegativeStockOverrideAdmin(
  tx: any,
  body: any,
  details: Array<{ inventoryProductId: string; locationId: string; batchNo?: string | null; balance: number; requiredQty: number; message: string }>
) {
  const requestedOverride = body?.negativeStockOverride === true;
  const adminEmail = typeof body?.overrideAdminEmail === "string" ? body.overrideAdminEmail.trim() : "";
  const adminPassword = typeof body?.overrideAdminPassword === "string" ? body.overrideAdminPassword : "";

  if (!requestedOverride || !adminEmail || !adminPassword) {
    throw new NegativeStockAuthorizationError("Admin authorization is required to continue with negative stock.", details);
  }

  const authorizingAdmin = await tx.user.findUnique({ where: { email: adminEmail } });
  if (!authorizingAdmin || authorizingAdmin.role !== "ADMIN") {
    throw new NegativeStockAuthorizationError("Invalid admin email or password.", details, "NEGATIVE_STOCK_AUTH_INVALID");
  }

  const passwordValid = await verifyPassword(adminPassword, authorizingAdmin.passwordHash);
  if (!passwordValid) {
    throw new NegativeStockAuthorizationError("Invalid admin email or password.", details, "NEGATIVE_STOCK_AUTH_INVALID");
  }

  return {
    id: authorizingAdmin.id,
    name: authorizingAdmin.name,
    email: authorizingAdmin.email,
  };
}

type StockLinePayload = {
  inventoryProductId?: string;
  qty?: number;
  uomCode?: string | null;
  unitCost?: number | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  serialNos?: string[] | null;
  remarks?: string | null;
  locationId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  adjustmentDirection?: "IN" | "OUT" | null;
};

function normalizeType(value: unknown) {
  if (value === "OB" || value === "SR" || value === "SI" || value === "SA" || value === "ST" || value === "AS") {
    return value as StockTransactionType;
  }
  throw new Error("Invalid stock transaction type.");
}

function normalizeAdjustmentDirection(value: unknown) {
  if (value === "IN" || value === "OUT") return value as StockAdjustmentDirection;
  return null;
}

function normalizeSerialNumbers(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const serialNo of normalized) {
    const key = serialNo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(serialNo);
  }
  return unique;
}

function roundQty(value: unknown) {
  return roundToDecimalPlaces(Number(value ?? 0), STOCK_STORAGE_DECIMAL_PLACES.qty);
}

function normalizeUomCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function resolveConversionRate(product: any, uomCode: string) {
  if (!uomCode || uomCode === product.baseUom) return 1;
  const matched = Array.isArray(product.uomConversions)
    ? product.uomConversions.find((item: any) => item.uomCode.toUpperCase() === uomCode)
    : null;
  if (!matched) {
    throw new Error(`Selected UOM ${uomCode} is invalid for the selected product.`);
  }
  const rate = Number(matched.conversionRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Selected UOM ${uomCode} has invalid conversion rate.`);
  }
  return roundToDecimalPlaces(rate, STOCK_STORAGE_DECIMAL_PLACES.conversionRate);
}

function convertQtyToBase(qty: number, rate: number) {
  return roundToDecimalPlaces(qty * rate, STOCK_STORAGE_DECIMAL_PLACES.qty);
}

function transactionUsesOutboundLocation(
  transactionType: StockTransactionType,
  adjustmentDirection: StockAdjustmentDirection | null,
  line: { locationId: string | null; fromLocationId: string | null }
) {
  if (transactionType === "ST") return line.fromLocationId;
  if (transactionType === "SI") return line.locationId;
  if ((transactionType === "SA" || transactionType === "AS") && adjustmentDirection === "OUT") return line.locationId;
  return null;
}

function parseRevisionDocNo(docNo: string | null | undefined, transactionType: StockTransactionType) {
  const value = String(docNo || "").trim().toUpperCase();
  if (!value) return null;

  const escapedType = transactionType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const standardMatch = value.match(new RegExp(`^(${escapedType}-\\d{8}-\\d{4})(?:-(\\d+))?$`));
  if (standardMatch) {
    return {
      baseDocNo: standardMatch[1],
      revisionNo: standardMatch[2] ? Number(standardMatch[2]) : 0,
    };
  }

  const genericMatch = value.match(/^(.*?)(?:-(\d+))?$/);
  if (!genericMatch) return null;
  return {
    baseDocNo: genericMatch[1],
    revisionNo: genericMatch[2] ? Number(genericMatch[2]) : 0,
  };
}

async function generateStockRevisionDocumentNumber(
  tx: any,
  transactionType: StockTransactionType,
  currentDocNo: string | null | undefined
) {
  const parsed = parseRevisionDocNo(currentDocNo, transactionType);
  if (!parsed) {
    throw new Error("Current Document No is invalid for revision.");
  }

  const related = await tx.stockTransaction.findMany({
    where: {
      transactionType,
      docNo: {
        startsWith: parsed.baseDocNo,
      },
    },
    select: { docNo: true },
  });

  let maxRevision = 0;
  for (const item of related) {
    const candidate = parseRevisionDocNo(item.docNo, transactionType);
    if (!candidate || candidate.baseDocNo != parsed.baseDocNo) continue;
    if (candidate.revisionNo > maxRevision) {
      maxRevision = candidate.revisionNo;
    }
  }

  return `${parsed.baseDocNo}-${maxRevision + 1}`;
}

export async function GET(_req: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const transaction = await db.stockTransaction.findUnique({
      where: { id },
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        cancelledByAdmin: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true, projectId: true } },
        revisedFrom: { select: { id: true, docNo: true } },
        lines: {
          include: {
            inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
            location: { select: { id: true, code: true, name: true } },
            fromLocation: { select: { id: true, code: true, name: true } },
            toLocation: { select: { id: true, code: true, name: true } },
            serialEntries: {
              orderBy: [{ serialNo: "asc" }],
              include: {
                inventorySerial: { select: { id: true, serialNo: true, status: true } },
                inventoryBatch: { select: { id: true, batchNo: true, expiryDate: true } },
              },
            },
            ledgerEntries: {
              orderBy: [{ createdAt: "asc" }],
              include: { location: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    });
    if (!transaction) {
      return NextResponse.json({ ok: false, error: "Stock transaction not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load stock transaction." },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500 }
    );
  }
}

async function applyCancellation(tx: any, transaction: any, adminId: string, cancelReason: string | null) {
  for (const line of transaction.lines) {
    const qty = roundQty(line.qty);
    const batchNo = line.batchNo || undefined;

    if (line.serialEntries.length > 0) {
      for (const serialEntry of line.serialEntries) {
        const serial = serialEntry.inventorySerialId
          ? await tx.inventorySerial.findUnique({ where: { id: serialEntry.inventorySerialId } })
          : await tx.inventorySerial.findUnique({
              where: { inventoryProductId_serialNo: { inventoryProductId: line.inventoryProductId, serialNo: serialEntry.serialNo } },
            });
        if (!serial) throw new Error(`Serial No ${serialEntry.serialNo} cannot be found for edit.`);

        if (
          transaction.transactionType === "OB" ||
          transaction.transactionType === "SR" ||
          ((transaction.transactionType === "SA" || transaction.transactionType === "AS") &&
            line.adjustmentDirection === "IN")
        ) {
          if (serial.status !== "IN_STOCK" || serial.currentLocationId !== line.locationId) {
            throw new Error(`Serial No ${serialEntry.serialNo} cannot be edited because later stock activity already changed it.`);
          }
        }
        if (
          transaction.transactionType === "SI" ||
          ((transaction.transactionType === "SA" || transaction.transactionType === "AS") &&
            line.adjustmentDirection === "OUT")
        ) {
          if (serial.status !== "OUT_OF_STOCK") {
            throw new Error(`Serial No ${serialEntry.serialNo} cannot be edited because it is no longer in outbound state.`);
          }
        }
        if (transaction.transactionType === "ST") {
          if (serial.status !== "IN_STOCK" || serial.currentLocationId !== line.toLocationId) {
            throw new Error(`Serial No ${serialEntry.serialNo} cannot be edited because it is no longer at the destination location.`);
          }
        }
      }
    } else {
      if (
        transaction.transactionType === "OB" ||
        transaction.transactionType === "SR" ||
        ((transaction.transactionType === "SA" || transaction.transactionType === "AS") &&
          line.adjustmentDirection === "IN")
      ) {
        const balance = await getStockBalance(tx, line.inventoryProductId, line.locationId!, { batchNo });
        if (balance < qty) {
          throw new Error(`Transaction ${transaction.transactionNo} cannot be edited because the current stock balance is no longer sufficient to reverse it.`);
        }
      }
      if (transaction.transactionType === "ST") {
        const destinationBalance = await getStockBalance(tx, line.inventoryProductId, line.toLocationId!, { batchNo });
        if (destinationBalance < qty) {
          throw new Error(`Transaction ${transaction.transactionNo} cannot be edited because the destination stock balance is no longer sufficient to reverse it.`);
        }
      }
    }
  }

  for (const line of transaction.lines) {
    const qty = createStoredQtyDecimal(roundQty(line.qty));
    const remarks = line.remarks ?? transaction.remarks ?? "Edit reversal";

    if (transaction.transactionType === "ST") {
      const outValues = buildLedgerValues(qty, "OUT");
      const inValues = buildLedgerValues(qty, "IN");
      await tx.stockLedger.create({
        data: {
          movementDate: new Date(),
          movementType: transaction.transactionType,
          movementDirection: "OUT",
          ...outValues,
          batchNo: line.batchNo,
          inventoryProductId: line.inventoryProductId,
          locationId: line.toLocationId!,
          transactionId: transaction.id,
          transactionLineId: line.id,
          referenceNo: transaction.transactionNo,
          referenceText: "Edit reversal",
          sourceType: "MANUAL_STOCK_TRANSACTION_EDIT",
          sourceId: transaction.id,
          remarks,
        },
      });
      await tx.stockLedger.create({
        data: {
          movementDate: new Date(),
          movementType: transaction.transactionType,
          movementDirection: "IN",
          ...inValues,
          batchNo: line.batchNo,
          inventoryProductId: line.inventoryProductId,
          locationId: line.fromLocationId!,
          transactionId: transaction.id,
          transactionLineId: line.id,
          referenceNo: transaction.transactionNo,
          referenceText: "Edit reversal",
          sourceType: "MANUAL_STOCK_TRANSACTION_EDIT",
          sourceId: transaction.id,
          remarks,
        },
      });
    } else {
      const reverseDirection =
        transaction.transactionType === "SI" ||
        ((transaction.transactionType === "SA" || transaction.transactionType === "AS") &&
          line.adjustmentDirection === "OUT")
          ? "IN"
          : "OUT";
      const ledgerValues = buildLedgerValues(qty, reverseDirection);
      await tx.stockLedger.create({
        data: {
          movementDate: new Date(),
          movementType: transaction.transactionType,
          movementDirection: reverseDirection,
          ...ledgerValues,
          batchNo: line.batchNo,
          inventoryProductId: line.inventoryProductId,
          locationId: line.locationId!,
          transactionId: transaction.id,
          transactionLineId: line.id,
          referenceNo: transaction.transactionNo,
          referenceText: "Edit reversal",
          sourceType: "MANUAL_STOCK_TRANSACTION_EDIT",
          sourceId: transaction.id,
          remarks,
        },
      });
    }

    if (line.serialEntries.length > 0) {
      for (const serialEntry of line.serialEntries) {
        const serial = serialEntry.inventorySerialId
          ? await tx.inventorySerial.findUnique({ where: { id: serialEntry.inventorySerialId } })
          : await tx.inventorySerial.findUnique({
              where: { inventoryProductId_serialNo: { inventoryProductId: line.inventoryProductId, serialNo: serialEntry.serialNo } },
            });
        if (!serial) continue;
        if (
          transaction.transactionType === "OB" ||
          transaction.transactionType === "SR" ||
          ((transaction.transactionType === "SA" || transaction.transactionType === "AS") &&
            line.adjustmentDirection === "IN")
        ) {
          await tx.inventorySerial.update({
            where: { id: serial.id },
            data: { status: "OUT_OF_STOCK", currentLocationId: null },
          });
        } else if (
          transaction.transactionType === "SI" ||
          ((transaction.transactionType === "SA" || transaction.transactionType === "AS") &&
            line.adjustmentDirection === "OUT")
        ) {
          await tx.inventorySerial.update({
            where: { id: serial.id },
            data: { status: "IN_STOCK", currentLocationId: line.locationId },
          });
        } else if (transaction.transactionType === "ST") {
          await tx.inventorySerial.update({
            where: { id: serial.id },
            data: { status: "IN_STOCK", currentLocationId: line.fromLocationId },
          });
        }
      }
    }
  }

  await tx.stockTransaction.update({
    where: { id: transaction.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByAdminId: adminId,
      cancelReason,
    },
  });
}

export async function PUT(req: Request, context: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.stockTransaction.findUnique({
      where: { id },
      include: { lines: { include: { serialEntries: true } } },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Stock transaction not found." }, { status: 404 });
    }
    if (existing.status === "CANCELLED") {
      return NextResponse.json({ ok: false, error: "Cancelled transactions cannot be edited." }, { status: 400 });
    }

    const transactionType = normalizeType(body.transactionType);
    if (transactionType !== existing.transactionType) {
      return NextResponse.json({ ok: false, error: "Transaction type cannot be changed during edit." }, { status: 400 });
    }
    const transactionDate = normalizeStockDate(body.transactionDate);
    const docDate = normalizeStockDate(typeof body.docDate === "string" ? body.docDate : body.transactionDate);
    const requestedDocNo = assertValidDocumentNo(body.docNo);
    const docDesc = typeof body.docDesc === "string" ? body.docDesc.trim() || null : null;
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
    const departmentId = typeof body.departmentId === "string" && body.departmentId.trim() ? body.departmentId.trim() : null;
    const reference = typeof body.reference === "string" ? body.reference.trim() : null;
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : null;
    const rawLines = Array.isArray(body.lines) ? (body.lines as StockLinePayload[]) : [];
    if (rawLines.length === 0) {
      return NextResponse.json({ ok: false, error: "Please provide at least one stock line." }, { status: 400 });
    }

    const config = await db.stockConfiguration.findUnique({ where: { id: "default" } });
    const projectFeatureEnabled = Boolean(config?.enableProject);
    const departmentFeatureEnabled = projectFeatureEnabled && Boolean(config?.enableDepartment);
    const formatConfig = {
      qtyDecimalPlaces: normalizeQtyDecimalPlaces(config?.qtyDecimalPlaces),
      unitCostDecimalPlaces: normalizeMoneyDecimalPlaces(config?.unitCostDecimalPlaces),
      priceDecimalPlaces: normalizeMoneyDecimalPlaces(config?.priceDecimalPlaces),
    };

    if (!config?.stockModuleEnabled) {
      return NextResponse.json({ ok: false, error: "Stock module is disabled." }, { status: 400 });
    }

    if (requestedDocNo && !canOverrideDocumentNo(config, transactionType)) {
      return NextResponse.json({ ok: false, error: "Manual Document No override is not allowed for this transaction type." }, { status: 400 });
    }

    const effectiveProjectId = projectFeatureEnabled ? projectId : null;
    const effectiveDepartmentId = departmentFeatureEnabled ? departmentId : null;

    if (effectiveDepartmentId && !effectiveProjectId) {
      return NextResponse.json({ ok: false, error: "Project is required when Department is selected." }, { status: 400 });
    }

    const [project, department] = await Promise.all([
      effectiveProjectId
        ? db.project.findUnique({ where: { id: effectiveProjectId }, select: { id: true, code: true, name: true, isActive: true } })
        : Promise.resolve(null),
      effectiveDepartmentId
        ? db.department.findUnique({ where: { id: effectiveDepartmentId }, select: { id: true, code: true, name: true, projectId: true, isActive: true } })
        : Promise.resolve(null),
    ]);

    if (effectiveProjectId && (!project || !project.isActive)) {
      return NextResponse.json({ ok: false, error: "Project is invalid or inactive." }, { status: 400 });
    }
    if (effectiveDepartmentId && (!department || !department.isActive)) {
      return NextResponse.json({ ok: false, error: "Department is invalid or inactive." }, { status: 400 });
    }
    if (department && project && department.projectId !== project.id) {
      return NextResponse.json({ ok: false, error: "Selected Department does not belong to the selected Project." }, { status: 400 });
    }

    const inventoryProductIds = Array.from(
      new Set(rawLines.map((line) => String(line.inventoryProductId || "").trim()).filter(Boolean))
    );
    const locationIds = Array.from(
      new Set(
        rawLines
          .flatMap((line) => [line.locationId, line.fromLocationId, line.toLocationId])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );

    const [products, locations] = await Promise.all([
      db.inventoryProduct.findMany({
        where: { id: { in: inventoryProductIds } },
        select: {
          id: true,
          isActive: true,
          trackInventory: true,
          batchTracking: true,
          serialNumberTracking: true,
          baseUom: true,
          uomConversions: { select: { uomCode: true, conversionRate: true } },
        },
      }),
      db.stockLocation.findMany({ where: { id: { in: locationIds } } }),
    ]);

    const productMap = new Map(products.map((item) => [item.id, item]));
    const locationMap = new Map(locations.map((item) => [item.id, item]));

    const normalizedLines = rawLines.map((line) => {
      const inventoryProductId = String(line.inventoryProductId || "").trim();
      const product = productMap.get(inventoryProductId);
      if (!product || !product.isActive || !product.trackInventory) {
        throw new Error("Selected stock item is invalid, inactive, or not tracked by inventory.");
      }

      const inputQty = assertPositiveQty(line.qty, "Quantity", formatConfig.qtyDecimalPlaces);
      const uomCode = normalizeUomCode((line as any).uomCode) || product.baseUom;
      const conversionRate = resolveConversionRate(product, uomCode);
      const qty = convertQtyToBase(inputQty, conversionRate);
      const unitCost =
        line.unitCost == null
          ? null
          : parseNonNegativeNumberWithDecimalPlaces(
              line.unitCost,
              formatConfig.unitCostDecimalPlaces,
              "Unit cost"
            );
      const batchNo = typeof line.batchNo === "string" ? line.batchNo.trim().toUpperCase() || null : null;
      const expiryDate = typeof line.expiryDate === "string" && line.expiryDate.trim() ? new Date(line.expiryDate) : null;
      const serialNos = normalizeSerialNumbers(line.serialNos);
      const adjustmentDirection = normalizeAdjustmentDirection(line.adjustmentDirection);
      const locationId = String(line.locationId || "").trim() || null;
      const fromLocationId = String(line.fromLocationId || "").trim() || null;
      const toLocationId = String(line.toLocationId || "").trim() || null;

      if (transactionType === "ST") {
        if (!fromLocationId || !toLocationId) {
          throw new Error("Stock Transfer requires both source and destination locations.");
        }
        if (fromLocationId === toLocationId) {
          throw new Error("Stock Transfer source and destination cannot be the same.");
        }
      } else if (!locationId) {
        throw new Error("This stock transaction requires a location.");
      }

      if (product.batchTracking && !batchNo) {
        throw new Error("Batch No is required for batch-tracked products.");
      }
      if (expiryDate && Number.isNaN(expiryDate.getTime())) {
        throw new Error("Expiry Date is invalid.");
      }
      if ((transactionType === "SA" || transactionType === "AS") && !adjustmentDirection) {
        throw new Error(`${transactionType === "AS" ? "Stock Assembly" : "Stock Adjustment"} requires adjustment direction IN or OUT.`);
      }
      if (transactionType !== "SA" && transactionType !== "AS" && adjustmentDirection) {
        throw new Error("Adjustment direction is only allowed for Stock Adjustment or Stock Assembly.");
      }
      if (product.serialNumberTracking) {
        if (serialNos.length === 0) {
          throw new Error("Serial No is required for serial-tracked product.");
        }
        if (inputQty !== serialNos.length) {
          throw new Error("Serial-tracked lines require quantity to match the number of serial numbers.");
        }
      }

      for (const locationRef of [locationId, fromLocationId, toLocationId]) {
        if (!locationRef) continue;
        const location = locationMap.get(locationRef);
        if (!location || !location.isActive) {
          throw new Error("Selected stock location is invalid or inactive.");
        }
      }

      return {
        inventoryProductId,
        qty,
        unitCost,
        batchNo,
        expiryDate,
        serialNos,
        remarks: typeof line.remarks === "string" ? line.remarks.trim() || null : null,
        locationId,
        fromLocationId,
        toLocationId,
        adjustmentDirection,
        product,
      };
    });

    const created = await db.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, buildTransactionEntityLockKey(id));

      const current = await tx.stockTransaction.findUnique({
        where: { id },
        include: { lines: { include: { serialEntries: true } } },
      });
      if (!current) throw new Error("Stock transaction not found.");
      if (current.status === "CANCELLED") throw new Error("Cancelled transactions cannot be edited.");

      await acquireAdvisoryLock(tx, buildTransactionNumberLockKey(transactionType, transactionDate));
      await acquireAdvisoryLock(tx, buildDocumentNumberLockKey(transactionType, docDate));
      await acquireStockMutationLocks(
        tx,
        [
          ...current.lines.map((line) => ({
            inventoryProductId: line.inventoryProductId,
            batchNo: line.batchNo,
            serialNos: line.serialEntries.map((serialEntry) => serialEntry.serialNo),
            locationId: line.locationId,
            fromLocationId: line.fromLocationId,
            toLocationId: line.toLocationId,
          })),
          ...normalizedLines.map((line) => ({
            inventoryProductId: line.inventoryProductId,
            batchNo: line.batchNo,
            serialNos: line.serialNos,
            locationId: line.locationId,
            fromLocationId: line.fromLocationId,
            toLocationId: line.toLocationId,
          })),
        ]
      );

      await applyCancellation(tx, current, admin.id, "Edited and reposted");

      const negativeStockDetails: Array<{ inventoryProductId: string; locationId: string; batchNo?: string | null; balance: number; requiredQty: number; message: string }> = [];
      for (const line of normalizedLines) {
        const usesOutbound =
          transactionType === "SI" ||
          transactionType === "ST" ||
          ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "OUT");
        if (!usesOutbound) continue;

        const outboundLocationId = transactionUsesOutboundLocation(transactionType, line.adjustmentDirection, line)!;
        if (line.product.serialNumberTracking) {
          const availableCount = await tx.inventorySerial.count({
            where: {
              inventoryProductId: line.inventoryProductId,
              currentLocationId: outboundLocationId,
              status: "IN_STOCK",
              serialNo: { in: line.serialNos },
              ...(line.batchNo ? { inventoryBatch: { is: { batchNo: line.batchNo } } } : {}),
            },
          });
          if (availableCount !== line.serialNos.length) {
            throw new Error("One or more selected serial numbers are unavailable at the selected location.");
          }
        } else {
          const balance = await getStockBalance(tx, line.inventoryProductId, outboundLocationId, { batchNo: line.batchNo });
          if (balance < line.qty) {
            negativeStockDetails.push({
              inventoryProductId: line.inventoryProductId,
              locationId: outboundLocationId,
              batchNo: line.batchNo,
              balance,
              requiredQty: line.qty,
              message: "Insufficient stock for edited transaction.",
            });
          }
        }
      }

      let negativeStockAuthorizedBy: { id: string; name: string; email: string } | null = null;
      if (negativeStockDetails.length > 0) {
        if (!config.allowNegativeStock) {
          throw new Error(negativeStockDetails[0].message);
        }
        negativeStockAuthorizedBy = await resolveNegativeStockOverrideAdmin(tx, body, negativeStockDetails);
      }

      const transactionNo = await generateStockTransactionNumber(tx, transactionType, transactionDate);

      const existingDocNoValue = typeof current.docNo === "string" ? current.docNo.trim().toUpperCase() : "";
      const requestedDocNoValue = typeof requestedDocNo === "string" ? requestedDocNo.trim().toUpperCase() : "";
      const shouldAutoGenerateRevisionDocNo =
        !requestedDocNoValue || (!!existingDocNoValue && requestedDocNoValue === existingDocNoValue);

      const docNo = shouldAutoGenerateRevisionDocNo
        ? await generateStockRevisionDocumentNumber(tx, transactionType, current.docNo)
        : requestedDocNoValue;

      const duplicateDocNo = await tx.stockTransaction.findFirst({
        where: {
          docNo,
          NOT: { id: current.id },
        },
        select: { id: true },
      });
      if (duplicateDocNo) {
        throw new Error("Document No already exists. Please save again so the system can generate the next available number.");
      }

      const transaction = await tx.stockTransaction.create({
        data: {
          transactionNo,
          docNo,
          docDate,
          docDesc,
          projectId: project?.id ?? null,
          departmentId: department?.id ?? null,
          transactionType,
          transactionDate,
          reference,
          remarks,
          createdByAdminId: admin.id,
          revisedFromId: current.id,
          lines: {
            create: normalizedLines.map((line) => ({
              inventoryProductId: line.inventoryProductId,
              qty: createStoredQtyDecimal(line.qty),
              unitCost: line.unitCost == null ? null : createStoredMoneyDecimal(line.unitCost),
              batchNo: line.batchNo,
              expiryDate: line.expiryDate,
              remarks: line.remarks,
              locationId: line.locationId,
              fromLocationId: line.fromLocationId,
              toLocationId: line.toLocationId,
              adjustmentDirection: line.adjustmentDirection,
              serialEntries: line.serialNos.length
                ? {
                    create: line.serialNos.map((serialNo) => ({
                      inventoryProductId: line.inventoryProductId,
                      serialNo,
                    })),
                  }
                : undefined,
            })),
          },
        },
        include: { lines: { include: { serialEntries: true } } },
      });

      for (const line of transaction.lines) {
        let batchId: string | null = null;
        if (line.batchNo) {
          const batch = await tx.inventoryBatch.upsert({
            where: { inventoryProductId_batchNo: { inventoryProductId: line.inventoryProductId, batchNo: line.batchNo } },
            update: { expiryDate: line.expiryDate ?? undefined },
            create: { inventoryProductId: line.inventoryProductId, batchNo: line.batchNo, expiryDate: line.expiryDate ?? undefined },
          });
          batchId = batch.id;
        }

        const qty = createStoredQtyDecimal(line.qty);
        const direction =
          transactionType === "ST"
            ? null
            : transactionType === "OB" ||
              transactionType === "SR" ||
              ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "IN")
              ? "IN"
              : "OUT";

        if (transactionType === "ST") {
          const outValues = buildLedgerValues(qty, "OUT");
          const inValues = buildLedgerValues(qty, "IN");
          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: "OUT",
              ...outValues,
              batchNo: line.batchNo,
              inventoryProductId: line.inventoryProductId,
              locationId: line.fromLocationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: transaction.reference,
              sourceType: "MANUAL_STOCK_TRANSACTION",
              sourceId: transaction.id,
              remarks: line.remarks ?? transaction.remarks,
            },
          });
          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: "IN",
              ...inValues,
              batchNo: line.batchNo,
              inventoryProductId: line.inventoryProductId,
              locationId: line.toLocationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: transaction.reference,
              sourceType: "MANUAL_STOCK_TRANSACTION",
              sourceId: transaction.id,
              remarks: line.remarks ?? transaction.remarks,
            },
          });
        } else {
          const values = buildLedgerValues(qty, direction!);
          await tx.stockLedger.create({
            data: {
              movementDate: transaction.transactionDate,
              movementType: transaction.transactionType,
              movementDirection: direction!,
              ...values,
              batchNo: line.batchNo,
              inventoryProductId: line.inventoryProductId,
              locationId: line.locationId!,
              transactionId: transaction.id,
              transactionLineId: line.id,
              referenceNo: transaction.transactionNo,
              referenceText: transaction.reference,
              sourceType: "MANUAL_STOCK_TRANSACTION",
              sourceId: transaction.id,
              remarks: line.remarks ?? transaction.remarks,
            },
          });
        }

        const serialEntries = await tx.stockTransactionLineSerial.findMany({
          where: { transactionLineId: line.id },
          orderBy: [{ serialNo: "asc" }],
        });

        if (serialEntries.length > 0) {
          if (
            transactionType === "OB" ||
            transactionType === "SR" ||
            ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "IN")
          ) {
            for (const serialEntry of serialEntries) {
              const existingSerial = await tx.inventorySerial.findUnique({
                where: {
                  inventoryProductId_serialNo: {
                    inventoryProductId: line.inventoryProductId,
                    serialNo: serialEntry.serialNo,
                  },
                },
              });
              let serialRecord;
              if (existingSerial) {
                if (existingSerial.status === "IN_STOCK") {
                  throw new Error(`Serial No ${serialEntry.serialNo} is already in stock for this product.`);
                }
                serialRecord = await tx.inventorySerial.update({
                  where: { id: existingSerial.id },
                  data: {
                    inventoryBatchId: batchId,
                    currentLocationId: line.locationId!,
                    status: "IN_STOCK",
                  },
                });
              } else {
                serialRecord = await tx.inventorySerial.create({
                  data: {
                    inventoryProductId: line.inventoryProductId,
                    inventoryBatchId: batchId,
                    serialNo: serialEntry.serialNo,
                    currentLocationId: line.locationId!,
                    status: "IN_STOCK",
                  },
                });
              }
              await tx.stockTransactionLineSerial.update({
                where: { id: serialEntry.id },
                data: { inventorySerialId: serialRecord.id, inventoryBatchId: batchId },
              });
            }
          }

          if (
            transactionType === "SI" ||
            ((transactionType === "SA" || transactionType === "AS") && line.adjustmentDirection === "OUT")
          ) {
            for (const serialEntry of serialEntries) {
              const serialRecord = await tx.inventorySerial.findUnique({
                where: {
                  inventoryProductId_serialNo: {
                    inventoryProductId: line.inventoryProductId,
                    serialNo: serialEntry.serialNo,
                  },
                },
              });
              if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== line.locationId) {
                throw new Error(`Serial No ${serialEntry.serialNo} is not available at the selected location.`);
              }
              await tx.inventorySerial.update({
                where: { id: serialRecord.id },
                data: { status: "OUT_OF_STOCK", currentLocationId: null },
              });
              await tx.stockTransactionLineSerial.update({
                where: { id: serialEntry.id },
                data: { inventorySerialId: serialRecord.id, inventoryBatchId: serialRecord.inventoryBatchId },
              });
            }
          }

          if (transactionType === "ST") {
            for (const serialEntry of serialEntries) {
              const serialRecord = await tx.inventorySerial.findUnique({
                where: {
                  inventoryProductId_serialNo: {
                    inventoryProductId: line.inventoryProductId,
                    serialNo: serialEntry.serialNo,
                  },
                },
              });
              if (!serialRecord || serialRecord.status !== "IN_STOCK" || serialRecord.currentLocationId !== line.fromLocationId) {
                throw new Error(`Serial No ${serialEntry.serialNo} is not available at the selected source location.`);
              }
              await tx.inventorySerial.update({
                where: { id: serialRecord.id },
                data: {
                  currentLocationId: line.toLocationId!,
                  inventoryBatchId: batchId ?? serialRecord.inventoryBatchId,
                  status: "IN_STOCK",
                },
              });
              await tx.stockTransactionLineSerial.update({
                where: { id: serialEntry.id },
                data: {
                  inventorySerialId: serialRecord.id,
                  inventoryBatchId: batchId ?? serialRecord.inventoryBatchId,
                },
              });
            }
          }
        }
      }

      return tx.stockTransaction.findUnique({
        where: { id: transaction.id },
        include: {
          createdByAdmin: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, code: true, name: true, projectId: true } },
          revisedFrom: { select: { id: true, docNo: true } },
          lines: {
            include: {
              inventoryProduct: { select: { id: true, code: true, description: true, baseUom: true } },
              location: { select: { id: true, code: true, name: true } },
              fromLocation: { select: { id: true, code: true, name: true } },
              toLocation: { select: { id: true, code: true, name: true } },
              serialEntries: {
                orderBy: [{ serialNo: "asc" }],
                include: { inventorySerial: { select: { id: true, serialNo: true, status: true } } },
              },
            },
          },
        },
      });
    });

    await createAuditLogFromRequest({
      req,
      user: admin,
      module: "Stock Transactions",
      action: "EDIT",
      entityType: "StockTransaction",
      entityId: created?.id,
      entityCode: created?.transactionNo,
      description: `${admin.name} edited stock transaction ${existing.transactionNo} and reposted as ${created?.transactionNo}.`,
      newValues: {
        originalTransactionId: existing.id,
        newTransactionId: created?.id,
        transactionType,
        transactionDate: transactionDate.toISOString(),
        docNo: created?.docNo ?? null,
        docDate: docDate.toISOString(),
        docDesc,
        projectId: projectFeatureEnabled ? (project?.id ?? null) : null,
        departmentId: departmentFeatureEnabled ? (department?.id ?? null) : null,
        reference,
        remarks,
        lineCount: normalizedLines.length,
      },
      status: "SUCCESS",
    });

    return NextResponse.json({ ok: true, transaction: created });
  } catch (error: any) {
    const isUniqueDocNo = error?.code === "P2002" && Array.isArray(error?.meta?.target) && error.meta.target.includes("docNo");
    const isNegativeStockAuth = error instanceof NegativeStockAuthorizationError;
    return NextResponse.json(
      {
        ok: false,
        code: isNegativeStockAuth ? error.code : undefined,
        details: isNegativeStockAuth ? error.details : undefined,
        error: isUniqueDocNo
          ? "Document No already exists. Please save again so the system can generate the next available number."
          : error instanceof Error
            ? error.message
            : "Unable to update stock transaction.",
      },
      {
        status:
          error instanceof Error && error.message === "FORBIDDEN"
            ? 403
            : isUniqueDocNo
              ? 409
              : isNegativeStockAuth
                ? 403
                : 500,
      }
    );
  }
}
