import { ChevronDown } from "lucide-react";

type SelectFieldProps = {
  defaultLabel: string;
  options: string[];
};

function SelectField({ defaultLabel, options }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        defaultValue=""
        className="w-full appearance-none rounded-full border border-white/10 bg-black/80 px-6 py-4 pr-14 text-white outline-none transition hover:border-white/25"
      >
        <option value="" disabled hidden>
          {defaultLabel}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70" />
    </div>
  );
}

export function VehicleSelector() {
  return (
    <section className="pb-10">
      <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-4">
        <SelectField
          defaultLabel="Brand"
          options={["Volkswagen", "Mazda"]}
        />

        <SelectField
          defaultLabel="Model"
          options={["MK7 GTI", "Mazda 3 MPS"]}
        />

        <SelectField
          defaultLabel="Year"
          options={["2018", "2011"]}
        />

        <SelectField
          defaultLabel="ECU"
          options={["Bosch MG1", "Bosch MED17"]}
        />
      </div>
    </section>
  );
}