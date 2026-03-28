import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex min-h-[72vh] items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04),transparent_55%)]" />

      <div className="container-rk relative z-10 flex flex-col items-center justify-center py-20 text-center md:py-24">
        
        {/* 🔥 HEADLINE */}
        <h1 className="max-w-5xl text-4xl font-bold uppercase leading-[0.95] text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)] md:text-6xl xl:text-7xl">
          Unlock Your Engine’s True Performance
        </h1>

        {/* 🔥 SUBTEXT */}
        <p className="mt-8 max-w-3xl text-lg leading-8 text-white/75 md:text-xl md:leading-9">
          Upload your ECU file, request custom tuning, and receive optimized
          performance maps — fast, secure, and built for real results.
        </p>

        {/* 🔥 BUTTONS (FIXED COLOR) */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/custom-tuning"
            className="rounded-full bg-red-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-red-500"
          >
            Start Tuning
          </Link>

          <Link
            href="/shop"
            className="rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
          >
            Browse Files
          </Link>
        </div>

        {/* 🔥 TRUST LINE */}
        <div className="mt-6 text-sm text-white/60">
          ✔ Fast turnaround&nbsp;&nbsp;✔ Professional calibration&nbsp;&nbsp;✔ Secure file handling
        </div>

      </div>
    </section>
  );
}