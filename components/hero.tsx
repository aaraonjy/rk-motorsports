import Link from "next/link";

export function Hero() {
  return (
    <section className="section-pad relative overflow-hidden">
      <div className="container-rk grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-white/50">RK Motorsports</p>
          <h1 className="text-4xl font-bold leading-tight md:text-6xl">
            ECU tuning portal built for
            <span className="block text-white/65">file-based remap workflow</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/70 md:text-lg">
            Sell ready-made files, accept custom tune requests, collect customer uploads,
            and deliver completed tuned files through a customer dashboard and admin portal.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/custom-tuning" className="btn-primary">Start custom tune</Link>
            <Link href="/shop" className="btn-secondary">Browse services</Link>
          </div>
        </div>
        <div className="card-rk p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["01", "Upload file"],
              ["02", "Admin tunes"],
              ["03", "Upload completed file"],
              ["04", "Customer downloads"],
            ].map(([step, title]) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-sm text-white/45">{step}</p>
                <h3 className="mt-2 text-xl font-semibold">{title}</h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
