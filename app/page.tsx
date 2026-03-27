import Link from "next/link";
import { Hero } from "@/components/hero";
import { VehicleSelector } from "@/components/vehicle-selector";
import { HomeServices } from "@/components/sections/home-services";
import { getProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";

export default async function HomePage() {
  const products = await getProducts();

  return (
    <>
      {/* Section 1 - dark */}
      <section className="bg-black/55 backdrop-blur-sm">
        <Hero />
      </section>

      {/* Section 2 - light */}
      <section className="bg-zinc-100/95 py-20 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] md:py-24">
        <div className="container-rk">
          <div className="rounded-[2rem] border border-black/5 bg-white/90 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.12)] md:p-12">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-black/45">
                Compare tuning options
              </p>

              <h2 className="mt-3 text-3xl font-bold md:text-5xl">
                Compare file tuning options for your vehicle
              </h2>

              <p className="mt-4 max-w-3xl text-base leading-7 text-black/65 md:text-lg">
                Select your vehicle platform and ECU to browse available tuning
                services, ready-made files, and custom file options.
              </p>
            </div>

            <VehicleSelector />

            <div className="mt-8">
              <Link
                href="/shop"
                className="inline-flex rounded-full bg-[#ff3b57] px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#ff2444]"
              >
                Find a file
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 - dark */}
      <section className="bg-zinc-900/90 py-20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:py-24">
        <HomeServices />
      </section>

      {/* Section 4 - light */}
      <section className="bg-zinc-100/95 py-20 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] md:py-24">
        <div className="container-rk">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-black/45">
              Featured services
            </p>

            <h2 className="mt-3 text-3xl font-bold md:text-5xl">
              Featured services
            </h2>

            <p className="mt-4 max-w-3xl text-black/65 md:text-lg">
              Explore featured ECU and TCU tuning services tailored for performance
              builds, daily-driven platforms, and custom remap workflows.
            </p>
          </div>

          <ProductGrid products={products} />
        </div>
      </section>
    </>
  );
}