import { Hero } from "@/components/hero";
import Link from "next/link";
import { getProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { VehicleSelector } from "@/components/vehicle-selector";

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <>
      {/* Section 1 - dark hero */}
      <section className="bg-black/55 backdrop-blur-sm">
        <Hero />
      </section>

      {/* Section 2 - white selector */}
      <section className="bg-zinc-100/95 py-24 text-black md:py-28">
        <div className="container-rk">
          <div className="rounded-[2rem] border border-black/5 bg-white/90 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.12)] md:p-12">
            
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-black/45">
                Compare tuning options
              </p>

              <h1 className="mt-3 text-3xl font-bold md:text-5xl">
                Compare file tuning options for your vehicle
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-7 text-black/65 md:text-lg">
                Select your vehicle platform and ECU to browse available tuning
                services, ready-made files, and custom file options.
              </p>
            </div>

            <VehicleSelector />

            <div className="mt-8 flex gap-4">
              <Link
                href="#shop-results"
                className="inline-flex rounded-full bg-[#ff3b57] px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-[#ff2444]"
              >
                Find a File
              </Link>

              <Link
                href="/custom-tuning"
                className="inline-flex rounded-full border border-black/10 bg-black px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-black/85"
              >
                Request Custom Tune
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Section 3 - products */}
      <section id="shop-results" className="bg-zinc-100/95 pb-24 text-black">
        <div className="container-rk">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-black/45">
              Available products
            </p>

            <h2 className="mt-3 text-3xl font-bold md:text-5xl">
              Browse available tuning files
            </h2>

            <p className="mt-4 max-w-3xl text-black/65 md:text-lg">
              Explore available ECU and TCU tuning products for supported vehicles and platforms.
            </p>
          </div>

          <ProductGrid products={products} />
        </div>
      </section>
    </>
  );
}