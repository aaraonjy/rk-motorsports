const services = [
  [
    "Ready-made map files",
    "Browse fixed tuning packages and ready-made services by platform, ECU type, and performance stage.",
  ],
  [
    "Custom file service",
    "Customer uploads an original ECU file, requests a tune, and receives a professionally prepared return file.",
  ],
  [
    "Admin workflow",
    "Track orders, manage uploaded files, update delivery status, and streamline customer communication.",
  ],
];

export function HomeServices() {
  return (
    <section className="py-20 md:py-24">
      <div className="container-rk">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1.4fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Built around your real workflow
            </p>

            <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
              Built around your real workflow
            </h2>

            <p className="mt-5 max-w-xl text-base leading-8 text-white/65 md:text-lg">
              From original file upload to final tuned file delivery, the platform
              is structured around the real process used by tuning businesses and
              file service providers.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {services.map(([title, desc]) => (
              <div
                key={title}
                className="rounded-[1.75rem] border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.35)] transition hover:bg-black/45"
              >
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-4 leading-7 text-white/70">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}