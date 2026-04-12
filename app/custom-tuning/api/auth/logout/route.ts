import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { createAuditLogFromRequest } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getSessionUser();

  if (user) {
    try {
      await createAuditLogFromRequest({
        req,
        user,
        module: "Authentication",
        action: "LOGOUT",
        entityType: "User",
        entityId: user.id,
        entityCode: user.email,
        description: `${user.name} logged out.`,
        status: "SUCCESS",
      });
    } catch (error) {
      console.error("Audit log creation failed:", error);
    }
  }

  await destroySession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
