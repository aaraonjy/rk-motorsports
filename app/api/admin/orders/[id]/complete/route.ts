import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    await db.order.update({
      where: { id },
      data: { status: "READY_FOR_DOWNLOAD" },
    });
    return NextResponse.redirect(new URL("/admin", req.url));
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
