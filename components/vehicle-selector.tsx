export function VehicleSelector() {
  return (
    <section className="pb-10">
      <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-4">
        <select className="w-full rounded-full border border-white/10 bg-black/80 px-5 py-4 text-white outline-none transition hover:border-white/25">
          <option>Brand</option>
          <option>Volkswagen</option>
          <option>Mazda</option>
        </select>

        <select className="w-full rounded-full border border-white/10 bg-black/80 px-5 py-4 text-white outline-none transition hover:border-white/25">
          <option>Model</option>
          <option>MK7 GTI</option>
          <option>Mazda 3 MPS</option>
        </select>

        <select className="w-full rounded-full border border-white/10 bg-black/80 px-5 py-4 text-white outline-none transition hover:border-white/25">
          <option>Year</option>
          <option>2018</option>
          <option>2011</option>
        </select>

        <select className="w-full rounded-full border border-white/10 bg-black/80 px-5 py-4 text-white outline-none transition hover:border-white/25">
          <option>ECU</option>
          <option>Bosch MG1</option>
          <option>Bosch MED17</option>
        </select>
      </div>
    </section>
  );
}