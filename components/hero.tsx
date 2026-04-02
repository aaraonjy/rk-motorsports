import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex min-h-[78vh] items-center justify-center overflow-hidden pt-24 md:min-h-[86vh]">
      {/* background image layer */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/background1.jpeg')" }}
      />

      {/* overlays */}
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/90" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_55%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-[#0a0a0a]" />

      <div className="container-rk relative z-10 flex flex-col items-center justify-center py-20 text-center md:py-24">
        <h1 className="max-w-4xl text-4xl font-bold leading-[1.02] tracking-tight text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)] md:text-5xl xl:text-6xl">
          Unlock Your Vehicle&apos;s True Performance
        </h1>

        <p className="mt-8 max-w-3xl text-lg leading-8 text-white/75 md:text-xl md:leading-9">
          Upload your ECU or TCU file, request custom tuning, and receive
          optimized performance maps — fast, secure, and built for real
          results.
        </p>

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

        <div className="mt-6 text-sm text-white/60">
          ✔ Fast turnaround&nbsp;&nbsp;✔ Professional calibration&nbsp;&nbsp;✔
          Secure file handling
        </div>
      </div>
    </section>
  );
}