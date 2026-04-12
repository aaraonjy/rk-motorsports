import { requireAdmin, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

function generateTempPassword() {
  return Math.random().toString(36).slice(-10);
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await req.json();
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = String(body?.phone || "").trim();

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

  const passwordHash = await hashPassword(generateTempPassword());

  await db.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      passwordHash,
      role: "CUSTOMER",
      accountSource: "ADMIN",
      portalAccess: false,
    },
  });

  return Response.json({ ok: true });
}
