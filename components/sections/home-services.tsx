const services = [
  ["Ready-made map files", "Sell fixed packages or ready services by platform."],
  ["Custom file service", "Customer uploads original ECU file and receives tuned return file."],
  ["Admin workflow", "Track orders, manage files, and update delivery status."],
];

export function HomeServices() {
  return (
    <section className="section-pad">
      <div className="container-rk">
        <h2 className="mb-8 text-3xl font-bold md:text-5xl">Built around your real workflow</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {services.map(([title, desc]) => (
            <div key={title} className="card-rk p-6">
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-white/70">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
