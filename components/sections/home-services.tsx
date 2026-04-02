import { Gauge, Wrench, Settings, Zap, Rocket, Flame } from "lucide-react";

const services = [
  {
    title: "Stage 1 / 2 / 3 ECU Tuning",
    desc: "Optimized ECU calibration from stock to fully modified setups. Improve power, torque, and throttle response.",
    icon: Gauge,
  },
  {
    title: "Custom ECU Calibration",
    desc: "Tailored tuning based on your hardware, fuel type, and performance goals. Ideal for hybrid turbos and advanced setups.",
    icon: Wrench,
  },
  {
    title: "TCU Performance Tuning",
    desc: "Optimize shift speed, clutch pressure, and torque limits for smoother and faster gear changes.",
    icon: Settings,
  },
  {
    title: "ECU + TCU Package",
    desc: "Combined engine and transmission tuning for maximum performance, drivability, and optimized power delivery.",
    icon: Zap,
  },
  {
    title: "Multi-Map Switching (On-The-Fly)",
    desc: "Switch maps using cruise control. Toggle fuel types, valet mode, or crackle profiles instantly.",
    icon: Rocket,
  },
  {
    title: "Pop & Bang / Flame Tuning",
    desc: "Aggressive crackles and flame effects on deceleration. Adjustable for street or track use.",
    icon: Flame,
  },
];

export function HomeServices() {
  return (
    <section id="services" className="py-12 md:py-14">
      <div className="container-rk">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Services
          </p>

          <h2 className="mt-4 text-3xl font-bold md:text-5xl">
            Professional ECU & TCU Tuning Services
          </h2>

          <p className="mt-4 mx-auto max-w-2xl text-white/65 md:text-lg">
            Explore our range of ECU and TCU tuning services tailored for daily
            drivers, performance street cars, and high-performance builds.
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