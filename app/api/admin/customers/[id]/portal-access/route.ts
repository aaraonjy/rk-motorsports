import { requireAdmin, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

function generateTempPassword() {
  return Math.random().toString(36).slice(-8);
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;

  const user = await db.user.findUnique({ where: { id } });
  if (!user) {
    return Response.json({ ok: false, error: "Customer not found." }, { status: 404 });
  }

  const newAccess = !user.portalAccess;
  let nextPasswordHash = user.passwordHash;
  let tempPassword: string | undefined;

  if (newAccess) {
    tempPassword = generateTempPassword();
    nextPasswordHash = await hashPassword(tempPassword);
  }

  await db.user.update({
    where: { id },
    data: {
      portalAccess: newAccess,
      passwordHash: nextPasswordHash,
    },
  });

  return Response.json({
    ok: true,
    tempPassword,
  });
}
