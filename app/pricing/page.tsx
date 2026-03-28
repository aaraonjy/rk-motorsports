const items = [
  ["Stage 1 ECU Tune", "From RM 1,500"],
  ["Stage 2 ECU Tune", "From RM 2,200"],
  ["Custom File Service", "From RM 1,800"],
];

const services = [
  "EGR off",
  "Lambda / Decat / O2 Off",
  "Pops and Bangs",
  "DTC off",
  "Speed Limiter Removal",
  "Cold Start Delete",
  "Launch Control",
  "MAF off",
  "Start Stop Disable",
];

export default function PricingPage() {
  return (
    <section className="pt-28 pb-20">
      <div className="container-rk">

        {/* TITLE */}
        <h1 className="text-4xl font-bold text-white md:text-5xl">
          Pricing
        </h1>

        <p className="mt-4 max-w-2xl text-white/70">
          Transparent pricing for ECU tuning services. Final quotation depends
          on vehicle model, ECU type, and requested options.
        </p>

        {/* MAIN CARDS */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map(([title, price]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/15 bg-black/50 p-6 backdrop-blur-md transition hover:border-white/30"
            >
              <h2 className="text-xl font-semibold text-white">
                {title}
              </h2>
              <p className="mt-3 text-white/70">{price}</p>
            </div>
          ))}
        </div>

        {/* SERVICE + PRICE SECTION */}
        <div className="mt-16 grid gap-10 md:grid-cols-2">

          {/* LEFT: SERVICES */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
            <h2 className="text-xl font-semibold text-white">
              Available Services
            </h2>

            <ul className="mt-6 space-y-3 text-white/70">
              {services.map((s) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
          </div>

          {/* RIGHT: PRICE BOX */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
            <h2 className="text-xl font-semibold text-white">
              Pricing Information
            </h2>

            <div className="mt-6 text-white/70 space-y-3">
              <p>
                Prices vary depending on vehicle platform, ECU type, and tuning
                complexity.
              </p>

              <p>
                Final quotation will be provided after file review.
              </p>
            </div>

            <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-white/60">
                Payment Method
              </p>

              <p className="mt-2 text-lg font-semibold text-white">
                Bank Transfer
              </p>

              <p className="mt-3 text-white/60 text-sm">
                PayPal integration coming soon.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 flex flex-wrap gap-4">
          <a
            href="/custom-tuning"
            className="rounded-full bg-[#ff3b57] px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-[#ff2444]"
          >
            Request Custom Tune
          </a>

          <a
            href="/contact"
            className="rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-white/20"
          >
            Contact Us
          </a>
        </div>

      </div>
    </section>
  );
}