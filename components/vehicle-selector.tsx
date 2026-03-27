export function VehicleSelector() {
  return (
    <section className="pb-10">
      <div className="container-rk">
        <div className="card-rk grid gap-4 p-6 md:grid-cols-4">
          <select className="input-rk"><option>Brand</option><option>Volkswagen</option><option>Mazda</option></select>
          <select className="input-rk"><option>Model</option><option>MK7 GTI</option><option>Mazda 3 MPS</option></select>
          <select className="input-rk"><option>Year</option><option>2018</option><option>2011</option></select>
          <select className="input-rk"><option>ECU</option><option>Bosch MG1</option><option>Bosch MED17</option></select>
        </div>
      </div>
    </section>
  );
}
