export default function ContactPage() {
  return (
    <section className="pt-28 pb-20">
      <div className="container-rk max-w-5xl">
        <h1 className="text-4xl font-bold text-white md:text-5xl">
          Contact Us
        </h1>

        <p className="mt-4 text-white/70 max-w-2xl">
          Get in touch with RK Motorsports for ECU tuning services, custom file
          requests, and enquiries. Please contact us before visiting.
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {/* LEFT INFO */}
          <div className="space-y-6 text-white/80">
            <div>
              <p className="text-sm text-white/50">Business</p>
              <p className="text-lg font-semibold">RK Motorsports</p>
            </div>

            <div>
              <p className="text-sm text-white/50">Phone / WhatsApp</p>
              <p className="text-lg font-semibold">012-310 6132</p>
            </div>

            <div>
              <p className="text-sm text-white/50">Address</p>
              <p className="text-lg font-semibold leading-relaxed">
                34, Jalan Tembaga SD 5/2b,<br />
                Bandar Sri Damansara,<br />
                52200 Kuala Lumpur, Selangor
              </p>
            </div>

            <div>
              <p className="text-sm text-white/50">Business Hours</p>
              <div className="text-sm space-y-1 mt-2 text-white/80">
                <p>Monday – Friday: 1:00 PM – 12:00 AM</p>
                <p>Saturday: 1:00 PM – 12:00 AM</p>
                <p>Sunday: 1:00 PM – 7:00 PM</p>
              </div>
            </div>

            <p className="text-sm text-white/50">
              * Please contact us before visiting to confirm availability.
            </p>
          </div>

          {/* RIGHT MAP */}
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <iframe
              src="https://www.google.com/maps?q=34%20Jalan%20Tembaga%20SD%205%2F2b%20Bandar%20Sri%20Damansara&output=embed"
              width="100%"
              height="100%"
              className="min-h-[350px] w-full"
              loading="lazy"
            ></iframe>
          </div>
        </div>
      </div>
    </section>
  );
}