import { Hero } from "@/components/hero";
import { VehicleSelector } from "@/components/vehicle-selector";
import { HomeServices } from "@/components/sections/home-services";
import { getProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";

export default async function HomePage() {
  const products = await getProducts();

  return (
    <>
      <Hero />
      <VehicleSelector />
      <HomeServices />
      <section className="section-pad pt-0">
        <div className="container-rk">
          <h2 className="mb-8 text-3xl font-bold md:text-5xl">Featured services</h2>
          <ProductGrid products={products} />
        </div>
      </section>
    </>
  );
}
