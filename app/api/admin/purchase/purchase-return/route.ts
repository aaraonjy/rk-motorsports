import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createPurchaseTransaction } from "@/lib/purchase";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const transaction = await createPurchaseTransaction("PR" as any, body, admin.id);
    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create document." }, { status: 400 });
  }
}
