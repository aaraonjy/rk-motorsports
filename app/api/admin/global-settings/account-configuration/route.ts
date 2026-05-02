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
    },
  });
}

export async function PATCH(req: Request) {
  await requireAdmin();

  const body = await req.json();
  const customerAccountPrefix = normalizeCustomerAccountPrefix(body?.customerAccountPrefix);
  const customerAccountNoFormat = normalizeCustomerAccountFormat(body?.customerAccountNoFormat);

  const validationError = validateCustomerAccountConfiguration({
    customerAccountPrefix,
    customerAccountNoFormat,
  });

  if (validationError) {
    return Response.json({ ok: false, error: validationError }, { status: 400 });
  }

  const config = await db.accountConfiguration.upsert({
    where: { id: DEFAULT_ACCOUNT_CONFIGURATION_ID },
    update: {
      customerAccountPrefix,
      customerAccountNoFormat,
    },
    create: {
      id: DEFAULT_ACCOUNT_CONFIGURATION_ID,
      customerAccountPrefix,
      customerAccountNoFormat,
    },
  });

  return Response.json({ ok: true, config });
}
