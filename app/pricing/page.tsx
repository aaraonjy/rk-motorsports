const items = [
  ["Stage 1 ECU Tune", "From RM 1,500"],
  ["Stage 2 ECU Tune", "From RM 2,200"],
  ["Custom File Service", "From RM 1,800"],
];

export default function PricingPage() {
  return (
    <section className="section-pad">
      <div className="container-rk">
        <h1 className="text-4xl font-bold">Pricing</h1>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {items.map(([title, price]) => (
            <div key={title} className="card-rk p-6">
              <h2 className="text-2xl font-semibold">{title}</h2>
              <p className="mt-3 text-white/70">{price}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
