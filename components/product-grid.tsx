import Link from "next/link";
import { Product } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {products.map((product) => (
        <div key={product.id} className="card-rk p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">{product.type.replaceAll("_", " ")}</p>
          <h3 className="mt-2 text-2xl font-semibold">{product.title}</h3>
          <p className="mt-3 text-white/70">{product.description}</p>
          <p className="mt-5 text-lg font-semibold">{formatCurrency(product.basePrice)}</p>
          <Link href="/custom-tuning" className="btn-secondary mt-5">Order now</Link>
        </div>
      ))}
    </div>
  );
}
