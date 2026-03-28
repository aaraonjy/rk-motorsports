import Link from "next/link";
import { VehicleSelector } from "@/components/vehicle-selector";

export default function ShopPage() {
  return (
    <section className="flex min-h-[calc(100vh-80px)] items-center pt-24">
      <div className="container-rk flex w-full justify-center">
        <div className="w-full max-w-6xl rounded-[2rem] border border-white/15 bg-black/55 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-md md:p-12">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Compare tuning options
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white md:text-5xl">
              Compare file tuning options for your vehicle
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/70 md:text-lg">
              Select your vehicle platform and ECU to browse available tuning
              services, ready-made files, and custom file options.
            </p>
          </div>

          <VehicleSelector />

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="#"
              className="inline-flex rounded-full bg-[#ff3b57] px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#ff2444]"
            >
              Find a File
            </Link>

            <Link
              href="/custom-tuning"
              className="inline-flex rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
            >
              Request Custom Tune
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}