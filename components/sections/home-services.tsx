import { Gauge, Wrench, Settings, Zap, Rocket, Flame } from "lucide-react";

const services = [
  {
    title: "Stage 1 / 2 / 3 Performance Tuning",
    desc: "Optimized ECU calibration for stock to fully modified setups. Increase power, torque, and throttle response with proven staged tuning solutions.",
    icon: Gauge,
  },
  {
    title: "Custom ECU Calibration",
    desc: "Tailored tuning based on your exact hardware setup, fuel type, and performance goals. Perfect for hybrid turbos, built engines, and advanced builds.",
    icon: Wrench,
  },
  {
    title: "Multi-Map Switching (On-The-Fly)",
    desc: "Switch between multiple maps using cruise control. Easily toggle between pump fuel, race fuel, valet mode, or crackle profiles anytime.",
    icon: Settings,
  },
  {
    title: "Boosted Launch Control (2-Step)",
    desc: "Launch with pre-built boost for maximum acceleration. Improves 60ft times and delivers consistent, repeatable drag performance.",
    icon: Zap,
  },
  {
    title: "Rolling Anti-Lag (RAL)",
    desc: "Maintain boost while cruising or between pulls. Eliminates turbo lag and delivers instant power during roll racing.",
    icon: Rocket,
  },
  {
    title: "Pop & Bang / Flame Tuning",
    desc: "Aggressive exhaust crackles and flame effects on deceleration. Customizable intensity for street or track presence.",
    icon: Flame,
  },
];

export function HomeServices() {
  return (
    <section id="services" className="py-20 md:py-24">
      <div className="container-rk">
        {/* Header */}
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Services
          </p>

          <h2 className="mt-4 text-3xl font-bold md:text-5xl">
            Professional ECU Tuning Services
          </h2>

          <p className="mt-4 mx-auto max-w-2xl text-white/65 md:text-lg">
            Explore our range of ECU and performance tuning services tailored for
            both daily drivers and high-performance builds.
          </p>
        </div>

        {/* Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <div
                key={service.title}
                className="group card-rk p-6 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/10"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="h-6 w-6 text-white" />
                </div>

                <h3 className="text-lg font-semibold text-white">
                  {service.title}
                </h3>

                <p className="mt-3 text-sm leading-6 text-white/70">
                  {service.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}