import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex min-h-[78vh] items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/45 to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_55%)]" />

      <div className="container-rk relative z-10 flex flex-col items-center justify-center py-20 text-center md:py-24">
        <h1 className="max-w-5xl text-4xl font-bold uppercase leading-[0.95] text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)] md:text-6xl xl:text-7xl">
          Online ECU file service
        </h1>

        <p className="mt-8 max-w-3xl text-lg leading-8 text-white/75 md:text-xl md:leading-9">
          Upload original ECU files, request custom tuning, and receive completed
          tuned files through a premium customer and admin workflow portal.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/register"
            className="rounded-full bg-[#ff3b57] px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#ff2444]"
          >
            Register
          </Link>

          <Link
            href="/custom-tuning"
            className="rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
          >
            Start custom tune
          </Link>
        </div>

        <div className="mt-12 flex flex-col items-center text-white/70">
          <span className="text-xs uppercase tracking-[0.3em]">Scroll</span>
          <div className="mt-3 text-3xl leading-none">↓</div>
        </div>
      </div>
    </section>
  );
}