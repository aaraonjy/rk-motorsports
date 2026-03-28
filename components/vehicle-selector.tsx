"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import carLibrary from "@/lib/car-library.json";

type Engine = {
  id: string;
  name: string;
};

type Model = {
  id: string;
  name: string;
  engines: Engine[];
};

type Make = {
  make: string;
  models: Model[];
};

type VehicleSearchPayload = {
  make: string;
  model: string;
  engine: string;
};

type SelectFieldProps = {
  defaultLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function SelectField({
  defaultLabel,
  options,
  value,
  onChange,
  disabled = false,
}: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-full border border-white/10 bg-black/80 px-6 py-4 pr-14 text-white outline-none transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-50"
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

export function VehicleSelector({
  onSearch,
}: {
  onSearch?: (data: VehicleSearchPayload) => void;
}) {
  const library = carLibrary as Make[];

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");

  const brandOptions = useMemo(
    () => library.map((item) => item.make).sort((a, b) => a.localeCompare(b)),
    [library]
  );

  const selectedMake = useMemo(
    () => library.find((item) => item.make === brand),
    [library, brand]
  );

  const modelOptions = useMemo(
    () =>
      selectedMake
        ? selectedMake.models
            .map((item) => item.name)
            .sort((a, b) => a.localeCompare(b))
        : [],
    [selectedMake]
  );

  const selectedModel = useMemo(
    () => selectedMake?.models.find((item) => item.name === model),
    [selectedMake, model]
  );

  const engineOptions = useMemo(
    () =>
      selectedModel
        ? selectedModel.engines
            .map((item) => item.name)
            .sort((a, b) => a.localeCompare(b))
        : [],
    [selectedModel]
  );

  useEffect(() => {
    setModel("");
    setEngine("");
  }, [brand]);

  useEffect(() => {
    setEngine("");
  }, [model]);

  const handleSearch = () => {
    if (!brand || !model || !engine || !onSearch) return;
    onSearch({ make: brand, model, engine });
  };

  return (
    <section className="pb-10">
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            defaultLabel="Brand"
            options={brandOptions}
            value={brand}
            onChange={setBrand}
          />

          <SelectField
            defaultLabel="Model"
            options={modelOptions}
            value={model}
            onChange={setModel}
            disabled={!brand}
          />

          <SelectField
            defaultLabel="Engine"
            options={engineOptions}
            value={engine}
            onChange={setEngine}
            disabled={!model}
          />
        </div>

        {onSearch ? (
          <div className="mt-6 flex justify-start">
            <button
              type="button"
              onClick={handleSearch}
              disabled={!brand || !model || !engine}
              className="rounded-full bg-[#ff3b57] px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#ff2444] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Find Performance Estimate
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}