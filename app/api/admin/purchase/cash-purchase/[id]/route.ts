import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { cancelPurchaseTransaction, updatePurchaseTransaction } from "@/lib/purchase";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const transaction = await updatePurchaseTransaction("CP" as any, id, body, admin.id);
    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update document." }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    let reason = "Cancelled by admin";
    try { const body = await req.json(); reason = body?.reason || reason; } catch {}
    const transaction = await cancelPurchaseTransaction("CP" as any, id, admin.id, reason);
    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to cancel document." }, { status: 400 });
  }
}
