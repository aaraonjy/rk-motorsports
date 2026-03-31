export default function ContactPage() {
  return (
    <section className="pt-28 pb-20">
      <div className="container-rk max-w-6xl">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white md:text-5xl">
            Contact Us
          </h1>

          <p className="mt-4 max-w-2xl text-white/70">
            Get in touch with RK Motorsports for ECU tuning services, custom file
            requests, and enquiries. Please contact us before visiting.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          {/* LEFT INFO */}
          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
            <div className="space-y-8">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  Business
                </p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  RK Motorsports
                </p>
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  Phone / WhatsApp
                </p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  012-310 6132
                </p>

                <div className="mt-5">
                  <a
                    href="https://wa.me/60123106132"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-[#ff3b57] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff526b]"
                  >
                    WhatsApp Us
                  </a>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  Address
                </p>
                <p className="mt-3 text-lg font-semibold leading-relaxed text-white">
                  34, Jalan Tembaga SD 5/2b,
                  <br />
                  Bandar Sri Damansara,
                  <br />
                  52200 Kuala Lumpur, Selangor
                </p>
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  Business Hours
                </p>

                <div className="mt-4 space-y-2 text-sm text-white/80">
                  <p>Monday – Friday: 1:00 PM – 12:00 AM</p>
                  <p>Saturday: 1:00 PM – 12:00 AM</p>
                  <p>Sunday: 1:00 PM – 7:00 PM</p>
                </div>
              </div>
            </div>

            <p className="mt-8 text-sm leading-6 text-white/50">
              * Please contact us before visiting to confirm availability.
            </p>
          </div>

          {/* RIGHT MAP */}
          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-3 backdrop-blur-md md:p-4">
            <div className="mb-4 flex items-center justify-between px-2">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  Location
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  Visit RK Motorsports
                </p>
              </div>

              <a
                href="https://www.google.com/maps?q=34%20Jalan%20Tembaga%20SD%205%2F2b%20Bandar%20Sri%20Damansara"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                Open Map
              </a>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
              <iframe
                src="https://www.google.com/maps?q=34%20Jalan%20Tembaga%20SD%205%2F2b%20Bandar%20Sri%20Damansara&output=embed"
                width="100%"
                height="100%"
                className="min-h-[420px] w-full"
                loading="lazy"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}