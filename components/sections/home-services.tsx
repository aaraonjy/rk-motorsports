import { Gauge, Flame, Settings, Zap, Wrench, Rocket } from "lucide-react";

const services = [
  {
    title: "Stage 1 Remap",
    desc: "Optimized ECU calibration for stock vehicles improving power, torque, and throttle response.",
    icon: Gauge,
  },
  {
    title: "Stage 2 / 3 Remap",
    desc: "Custom tuning for modified setups including turbo upgrades, fueling, and exhaust systems.",
    icon: Rocket,
  },
  {
    title: "DPF / EGR Solutions",
    desc: "Software solutions to prevent common issues after hardware modifications.",
    icon: Settings,
  },
  {
    title: "Pop & Bang / Flames",
    desc: "Enhance exhaust sound with controlled pops, crackles, or flame tuning.",
    icon: Flame,
  },
  {
    title: "Launch Control",
    desc: "Optimized launch strategy for faster acceleration and consistent performance.",
    icon: Zap,
  },
  {
    title: "Custom ECU File",
    desc: "Upload your ECU file and receive a fully custom-tuned calibration.",
    icon: Wrench,
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

          <p className="mt-4 max-w-2xl mx-auto text-white/65 md:text-lg">
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