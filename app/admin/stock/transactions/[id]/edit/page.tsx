import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export default async function AdminStockTransactionEditPlaceholderPage({ params }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");
  const { id } = await params;

  return (
    <section className="section-pad">
      <div className="container-rk max-w-4xl rounded-[2rem] border border-white/10 bg-black/30 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Phase 3</p>
        <h1 className="mt-3 text-3xl font-bold">Edit Transaction</h1>
        <p className="mt-4 text-white/70">Edit routing structure is now in place for transaction {id}. The actual reverse-and-repost edit engine will be implemented in Phase 3.</p>
        <div className="mt-6">
          <Link href={`/admin/stock/transactions/${id}`} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm text-white/80 transition hover:bg-white/10">Back to Transaction Detail</Link>
        </div>
      </div>
    </section>
  );
}
