import { getProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Shop</h1>
        <p className="mt-4 text-white/70">Browse available services and file-based tuning products.</p>
        <div className="mt-8">
          <ProductGrid products={products} />
        </div>
      </div>
    </section>
  );
}
