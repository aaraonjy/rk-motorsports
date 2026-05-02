import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveCustomerAccountNo } from "@/lib/customer-account";
import { CUSTOMER_REGISTRATION_ID_TYPES } from "@/lib/customer-profile-options";

function getText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNullableText(body: Record<string, unknown>, key: string) {
  const value = getText(body, key);
  return value || null;
}

function getNonNegativeInt(body: Record<string, unknown>, key: string) {
  const numeric = Number(body[key] ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function getNonNegativeMoney(body: Record<string, unknown>, key: string) {
  const numeric = Number(body[key] ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

async function resolveCountryCode(value: string) {
  const countryCode = value.trim().toUpperCase() || "MY";
  const country = await db.country.findFirst({ where: { code: countryCode, isActive: true }, select: { code: true } });
  if (!country) {
    throw new Error(`Selected country code ${countryCode} is not available. Please create or activate it in Country Maintenance.`);
  }
  return country.code;
}

async function resolveCurrency(value: string) {
  const currencyCode = value.trim().toUpperCase() || "MYR";
  const currency = await db.currency.findFirst({ where: { code: currencyCode, isActive: true }, select: { code: true } });
  if (!currency) {
    throw new Error(`Selected currency code ${currencyCode} is not available. Please create or activate it in Currency Maintenance.`);
  }
  return currency.code;
}

function normalizeRegistrationIdType(value: string) {
  const registrationIdType = value.trim().toUpperCase();
  return CUSTOMER_REGISTRATION_ID_TYPES.some((item) => item.value === registrationIdType) ? registrationIdType : null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getDeliveryAddresses(body: Record<string, unknown>) {
  const raw = Array.isArray(body.deliveryAddresses) ? body.deliveryAddresses : [];
  const mapped = await Promise.all(
    raw.map(async (item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const addressLine1 = getText(record, "addressLine1");
      if (!addressLine1) return null;

      return {
        label: getNullableText(record, "label"),
        addressLine1,
        addressLine2: getNullableText(record, "addressLine2"),
        addressLine3: getNullableText(record, "addressLine3"),
        addressLine4: getNullableText(record, "addressLine4"),
        city: getNullableText(record, "city"),
        postCode: getNullableText(record, "postCode"),
        countryCode: await resolveCountryCode(getText(record, "countryCode")),
      };
    })
  );

  return mapped.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function resolveAgentId(agentId: string | null) {
  if (!agentId) return null;

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { id: true, isActive: true } });
  if (!agent || !agent.isActive) throw new Error("Selected agent is not available.");
  return agent.id;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;

  const body = (await req.json()) as Record<string, unknown>;
  const name = getText(body, "name");
  const email = normalizeEmail(getText(body, "email"));
  const phone = getText(body, "phone");

  if (!name) return Response.json({ ok: false, error: "Customer name is required." }, { status: 400 });
  if (!email) return Response.json({ ok: false, error: "Email is required." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });

  const customer = await db.user.findUnique({ where: { id } });
  if (!customer) return Response.json({ ok: false, error: "Customer not found." }, { status: 404 });

  if (customer.accountSource === "PORTAL" && customer.email !== email) {
    return Response.json({ ok: false, error: "Email cannot be changed for self-registered customers." }, { status: 400 });
  }

  const existingEmail = await db.user.findFirst({ where: { email, NOT: { id } } });
  if (existingEmail) return Response.json({ ok: false, error: "This email is already used by another customer." }, { status: 409 });

  if (phone) {
    const existingPhone = await db.user.findFirst({ where: { phone, NOT: { id } }, select: { id: true } });
    if (existingPhone) return Response.json({ ok: false, error: "This phone number is already used by another customer." }, { status: 409 });
  }

  let agentId: string | null = null;
  try {
    agentId = await resolveAgentId(getNullableText(body, "agentId"));
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Selected agent is not available." }, { status: 400 });
  }

  const requestedAccountNo = getNullableText(body, "customerAccountNo");
  const accountNoResult = requestedAccountNo
    ? await resolveCustomerAccountNo({ db, customerName: name, overrideAccountNo: requestedAccountNo, excludeCustomerId: id })
    : null;

  if (accountNoResult && !accountNoResult.ok) {
    return Response.json({ ok: false, error: accountNoResult.error }, { status: 400 });
  }

  let billingCountryCode = "MY";
  let deliveryCountryCode = "MY";
  let currency = "MYR";
  let deliveryAddresses: Awaited<ReturnType<typeof getDeliveryAddresses>> = [];

  try {
    billingCountryCode = await resolveCountryCode(getText(body, "billingCountryCode"));
    deliveryCountryCode = await resolveCountryCode(getText(body, "deliveryCountryCode"));
    currency = await resolveCurrency(getText(body, "currency"));
    deliveryAddresses = await getDeliveryAddresses(body);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Invalid country or currency selection." }, { status: 400 });
  }

  await db.user.update({
    where: { id },
    data: {
      name,
      email,
      phone: phone || null,
      phone2: getNullableText(body, "phone2"),
      fax: getNullableText(body, "fax"),
      ...(accountNoResult?.ok ? { customerAccountNo: accountNoResult.customerAccountNo } : {}),
      billingAddressLine1: getNullableText(body, "billingAddressLine1"),
      billingAddressLine2: getNullableText(body, "billingAddressLine2"),
      billingAddressLine3: getNullableText(body, "billingAddressLine3"),
      billingAddressLine4: getNullableText(body, "billingAddressLine4"),
      billingCity: getNullableText(body, "billingCity"),
      billingPostCode: getNullableText(body, "billingPostCode"),
      billingCountryCode,
      deliveryAddressLine1: getNullableText(body, "deliveryAddressLine1"),
      deliveryAddressLine2: getNullableText(body, "deliveryAddressLine2"),
      deliveryAddressLine3: getNullableText(body, "deliveryAddressLine3"),
      deliveryAddressLine4: getNullableText(body, "deliveryAddressLine4"),
      deliveryCity: getNullableText(body, "deliveryCity"),
      deliveryPostCode: getNullableText(body, "deliveryPostCode"),
      deliveryCountryCode,
      area: getNullableText(body, "area"),
      attention: getNullableText(body, "attention"),
      contactPerson: getNullableText(body, "contactPerson"),
      emailCc: getNullableText(body, "emailCc"),
      currency,
      agentId,
      natureOfBusiness: getNullableText(body, "natureOfBusiness"),
      registrationIdType: normalizeRegistrationIdType(getText(body, "registrationIdType")) as any,
      registrationNo: getNullableText(body, "registrationNo"),
      taxIdentificationNo: getNullableText(body, "taxIdentificationNo"),
      creditTermsDays: getNonNegativeInt(body, "creditTermsDays"),
      creditLimitAmount: getNonNegativeMoney(body, "creditLimitAmount"),
      deliveryAddresses: {
        deleteMany: {},
        ...(deliveryAddresses.length > 0 ? { create: deliveryAddresses } : {}),
      },
    },
  });

  return Response.json({ ok: true });
}
