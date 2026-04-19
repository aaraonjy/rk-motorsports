import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = {
  params: Promise<{ productId: string }> ;
};

export default async function AdminAssemblyTemplatePage({ params }: Params) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { productId } = await params;

  const product = await db.inventoryProduct.findUnique({
    where: { id: productId },
    select: {
      id: true,
      code: true,
      description: true,
      itemType: true,
      trackInventory: true,
      batchTracking: true,
      serialNumberTracking: true,
      isAssemblyItem: true,
    },
  });

  if (!product) notFound();

  return (
    <section className="section-pad">
      <div className="container-rk max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Stock Assembly</p>
            <h1 className="mt-3 text-4xl font-bold text-white">Assembly Template Setup</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Configure the default BOM / component recipe for the selected finished good.
            </p>
          </div>
          <Link
            href="/admin/stock/products"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to Product Master
          </Link>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Finished Good</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{product.code}</h2>
              <p className="mt-2 text-white/75">{product.description}</p>
            </div>
            <div className="grid gap-3 text-sm text-white/80">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">Item Type: {product.itemType}</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">Track Inventory: {product.trackInventory ? "Yes" : "No"}</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">Batch Tracking: {product.batchTracking ? "Yes" : "No"}</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">Serial Tracking: {product.serialNumberTracking ? "Yes" : "No"}</div>
            </div>
          </div>

          {!product.isAssemblyItem ? (
            <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
              This product is not marked as an Assembly Item. Please go back to Product Master and enable Assembly Item first.
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-5 text-sm text-sky-100">
              <p className="font-semibold">Assembly Template foundation is ready.</p>
              <p className="mt-2 text-sky-100/80">
                This page is prepared as the separate entry point for the next step: adding BOM template lines such as component item, qty, UOM, required flag, and allow override.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
