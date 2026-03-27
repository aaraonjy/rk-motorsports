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
      {/* Section 1 */}
      <Hero />

      {/* Section 2 */}
      <section className="relative z-10 -mt-6 pb-20 md:-mt-8 md:pb-24">
        <div className="container-rk">
          <div className="rounded-none border border-black/5 bg-white/95 p-8 text-black shadow-[0_20px_80px_rgba(0,0,0,0.22)] md:p-12">
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

        <div className="mt-16">
          <HomeServices />
        </div>
      </section>

      {/* Section 3 */}
      <section className="py-20 md:py-24">
        <div className="container-rk">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Featured services
            </p>

            <h2 className="mt-3 text-3xl font-bold text-white md:text-5xl">
              Featured services
            </h2>

            <p className="mt-4 max-w-3xl text-white/65 md:text-lg">
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