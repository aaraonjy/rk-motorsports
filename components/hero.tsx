import Link from "next/link";

export function Hero() {
  return (
    <section className="section-pad relative overflow-hidden">
      <div className="container-rk grid gap-12 md:grid-cols-2 md:items-center">

        {/* LEFT CONTENT */}
        <div>
          {/* Small label */}
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-white/60">
            RK MOTORSPORTS
          </p>

          {/* Main headline */}
          <h1 className="text-5xl font-bold leading-[0.95] text-white drop-shadow-lg md:text-7xl">
            Performance ECU & TCU tuning
            <span className="block text-white/70">
              built for real workflow
            </span>
          </h1>

          {/* Description */}
          <p className="mt-6 max-w-xl text-base leading-8 text-white/80 drop-shadow md:text-lg">
            Upload original ECU files, request custom tuning, manage ready-made map services,
            and deliver completed files through a streamlined customer and admin portal.
          </p>

          {/* Buttons */}
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/custom-tuning"
              className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-zinc-200"
            >
              Start custom tune
            </Link>

            <Link
              href="/shop"
              className="rounded-2xl border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Browse services
            </Link>
          </div>
        </div>

        {/* RIGHT CARD */}
        <div className="rounded-3xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.4)] md:p-8">
          <div className="grid gap-4 md:grid-cols-2">

            {[
              ["01", "Upload original file"],
              ["02", "Admin tuning process"],
              ["03", "Upload completed file"],
              ["04", "Customer download"],
            ].map(([step, title]) => (
              <div
                key={step}
                className="rounded-2xl border border-white/15 bg-black/40 p-5 transition hover:bg-black/50"
              >
                <p className="text-sm text-white/40">{step}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {title}
                </h3>
              </div>
            ))}

          </div>
        </div>

      </div>
    </section>
  );
}