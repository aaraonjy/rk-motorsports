import { requireAdmin, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateNextCustomerAccountNo } from "@/lib/customer-account";
import {
  CUSTOMER_CURRENCIES,
  CUSTOMER_REGISTRATION_ID_TYPES,
  SEA_COUNTRIES,
} from "@/lib/customer-profile-options";

function generateTempPassword() {
  return Math.random().toString(36).slice(-10);
}

function getText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNullableText(body: Record<string, unknown>, key: string) {
  const value = getText(body, key);
  return value || null;
}

function normalizeCountryCode(value: string) {
  const countryCode = value.trim().toUpperCase();
  return SEA_COUNTRIES.some((country) => country.code === countryCode)
    ? countryCode
    : "MY";
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return CUSTOMER_CURRENCIES.some((item) => item.code === currency)
    ? currency
    : "MYR";
}

function normalizeRegistrationIdType(value: string) {
  const registrationIdType = value.trim().toUpperCase();
  return CUSTOMER_REGISTRATION_ID_TYPES.some((item) => item.value === registrationIdType)
    ? registrationIdType
    : null;
}

async function resolveAgentId(agentId: string | null) {
  if (!agentId) return null;

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, isActive: true },
  });

  if (!agent || !agent.isActive) {
    throw new Error("Selected agent is not available.");
  }

  return agent.id;
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = (await req.json()) as Record<string, unknown>;
  const name = getText(body, "name");
  const email = getText(body, "email").toLowerCase();
  const phone = getText(body, "phone");

  if (!name) {
    return Response.json({ ok: false, error: "Customer name is required." }, { status: 400 });
  }

  if (!email) {
    return Response.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const existingEmail = await db.user.findUnique({ where: { email } });
  if (existingEmail) {
    return Response.json(
      { ok: false, error: "This email is already used by another customer." },
      { status: 409 }
    );
  }

  if (phone) {
    const existingPhone = await db.user.findUnique({ where: { phone } });
    if (existingPhone) {
      return Response.json(
        { ok: false, error: "This phone number is already used by another customer." },
        { status: 409 }
      );
    }
  }

  let agentId: string | null = null;

  try {
    agentId = await resolveAgentId(getNullableText(body, "agentId"));
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Selected agent is not available." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(generateTempPassword());
  const customerAccountNo = await generateNextCustomerAccountNo(db, name);

  await db.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      phone2: getNullableText(body, "phone2"),
      fax: getNullableText(body, "fax"),
      customerAccountNo,
      passwordHash,
      role: "CUSTOMER",
      accountSource: "ADMIN",
      portalAccess: false,
      billingAddressLine1: getNullableText(body, "billingAddressLine1"),
      billingAddressLine2: getNullableText(body, "billingAddressLine2"),
      billingAddressLine3: getNullableText(body, "billingAddressLine3"),
      billingAddressLine4: getNullableText(body, "billingAddressLine4"),
      billingCity: getNullableText(body, "billingCity"),
      billingPostCode: getNullableText(body, "billingPostCode"),
      billingCountryCode: normalizeCountryCode(getText(body, "billingCountryCode")),
      deliveryAddressLine1: getNullableText(body, "deliveryAddressLine1"),
      deliveryAddressLine2: getNullableText(body, "deliveryAddressLine2"),
      deliveryAddressLine3: getNullableText(body, "deliveryAddressLine3"),
      deliveryAddressLine4: getNullableText(body, "deliveryAddressLine4"),
      deliveryCity: getNullableText(body, "deliveryCity"),
      deliveryPostCode: getNullableText(body, "deliveryPostCode"),
      deliveryCountryCode: normalizeCountryCode(getText(body, "deliveryCountryCode")),
      area: getNullableText(body, "area"),
      attention: getNullableText(body, "attention"),
      contactPerson: getNullableText(body, "contactPerson"),
      emailCc: getNullableText(body, "emailCc"),
      currency: normalizeCurrency(getText(body, "currency")),
      agentId,
      natureOfBusiness: getNullableText(body, "natureOfBusiness"),
      registrationIdType: normalizeRegistrationIdType(getText(body, "registrationIdType")) as any,
      registrationNo: getNullableText(body, "registrationNo"),
      taxIdentificationNo: getNullableText(body, "taxIdentificationNo"),
    },
  });

  return Response.json({ ok: true });
}
