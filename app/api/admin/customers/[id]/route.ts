import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;

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

  const customer = await db.user.findUnique({ where: { id } });
  if (!customer) {
    return Response.json({ ok: false, error: "Customer not found." }, { status: 404 });
  }

  if (customer.accountSource === "PORTAL" && customer.email !== email) {
    return Response.json(
      { ok: false, error: "Email cannot be changed for self-registered customers." },
      { status: 400 }
    );
  }

  const existingEmail = await db.user.findFirst({
    where: {
      email,
      NOT: { id },
    },
  });

  if (existingEmail) {
    return Response.json(
      { ok: false, error: "This email is already used by another customer." },
      { status: 409 }
    );
  }

  await db.user.update({
    where: { id },
    data: {
      name,
      email,
      phone: phone || null,
    },
  });

  return Response.json({ ok: true });
}
