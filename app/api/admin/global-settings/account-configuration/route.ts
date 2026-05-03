import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DEFAULT_ACCOUNT_CONFIGURATION_ID,
  DEFAULT_CUSTOMER_ACCOUNT_FORMAT,
  DEFAULT_CUSTOMER_ACCOUNT_PREFIX,
  normalizeCustomerAccountFormat,
  normalizeCustomerAccountPrefix,
  validateCustomerAccountConfiguration,
} from "@/lib/customer-account";
import {
  DEFAULT_SUPPLIER_ACCOUNT_FORMAT,
  DEFAULT_SUPPLIER_ACCOUNT_PREFIX,
  normalizeSupplierAccountFormat,
  normalizeSupplierAccountPrefix,
  validateSupplierAccountConfiguration,
} from "@/lib/supplier-account";

export async function GET() {
  await requireAdmin();

  const config = await db.accountConfiguration.findUnique({
    where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
  });

  return Response.json({
    ok: true,
    config: {
      customerAccountPrefix:
        config?.customerAccountPrefix || DEFAULT_CUSTOMER_ACCOUNT_PREFIX,
      customerAccountNoFormat:
        config?.customerAccountNoFormat || DEFAULT_CUSTOMER_ACCOUNT_FORMAT,
      supplierAccountPrefix:
        config?.supplierAccountPrefix || DEFAULT_SUPPLIER_ACCOUNT_PREFIX,
      supplierAccountNoFormat:
        config?.supplierAccountNoFormat || DEFAULT_SUPPLIER_ACCOUNT_FORMAT,
    },
  });
}

export async function PATCH(req: Request) {
  await requireAdmin();

  const body = await req.json();
  const customerAccountPrefix = normalizeCustomerAccountPrefix(body?.customerAccountPrefix);
  const customerAccountNoFormat = normalizeCustomerAccountFormat(body?.customerAccountNoFormat);
  const supplierAccountPrefix = normalizeSupplierAccountPrefix(body?.supplierAccountPrefix);
  const supplierAccountNoFormat = normalizeSupplierAccountFormat(body?.supplierAccountNoFormat);

  const customerValidationError = validateCustomerAccountConfiguration({
    customerAccountPrefix,
    customerAccountNoFormat,
  });

  if (customerValidationError) {
    return Response.json({ ok: false, error: customerValidationError }, { status: 400 });
  }

  const supplierValidationError = validateSupplierAccountConfiguration({
    supplierAccountPrefix,
    supplierAccountNoFormat,
  });

  if (supplierValidationError) {
    return Response.json({ ok: false, error: supplierValidationError }, { status: 400 });
  }

  const config = await db.accountConfiguration.upsert({
    where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
    update: {
      customerAccountPrefix,
      customerAccountNoFormat,
      supplierAccountPrefix,
      supplierAccountNoFormat,
    },
    create: {
      id: DEFAULT_ACCOUNT_CONFIGURATION_ID,
      customerAccountPrefix,
      customerAccountNoFormat,
      supplierAccountPrefix,
      supplierAccountNoFormat,
    },
  });

  return Response.json({ ok: true, config });
}
