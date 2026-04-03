"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

type VehicleSelectorProps = {
  onSearch?: (data: VehicleSearchPayload) => void;
};

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/60">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

export function VehicleSelector({ onSearch }: VehicleSelectorProps) {
  const router = useRouter();
  const library = carLibrary as Make[];

  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedEngineId, setSelectedEngineId] = useState("");
  const [error, setError] = useState("");

  const selectedMakeEntry = useMemo(
    () => library.find((item) => item.make === selectedMake) || null,
    [library, selectedMake]
  );

  const availableModels = selectedMakeEntry?.models || [];

  const selectedModelEntry = useMemo(
    () => availableModels.find((item) => item.id === selectedModelId) || null,
    [availableModels, selectedModelId]
  );

  const availableEngines = selectedModelEntry?.engines || [];

  const selectedEngineEntry = useMemo(
    () => availableEngines.find((item) => item.id === selectedEngineId) || null,
    [availableEngines, selectedEngineId]
  );

  useEffect(() => {
    setSelectedModelId("");
    setSelectedEngineId("");
  }, [selectedMake]);

  useEffect(() => {
    setSelectedEngineId("");
  }, [selectedModelId]);

  function getPayload(): VehicleSearchPayload | null {
    if (!selectedMakeEntry || !selectedModelEntry || !selectedEngineEntry) {
      return null;
    }

    return {
      make: selectedMakeEntry.make,
      model: selectedModelEntry.name,
      engine: selectedEngineEntry.name,
    };
  }

  function handleFindFile() {
    setError("");
    const payload = getPayload();

    if (!payload) {
      setError("Please select vehicle brand, model, and engine first.");
      return;
    }

    const params = new URLSearchParams({
      make: payload.make,
      model: payload.model,
      engine: payload.engine,
    });

    router.push(`/shop?${params.toString()}`);
  }

  function handleRequestCustomTune() {
    setError("");
    const payload = getPayload();

    if (!payload) {
      setError("Please select vehicle brand, model, and engine first.");
      return;
    }

    if (onSearch) {
      onSearch(payload);
    }

    const params = new URLSearchParams({
      make: payload.make,
      model: payload.model,
      engine: payload.engine,
    });

    router.push(`/custom-tuning?${params.toString()}`);
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-8">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative">
          <select
            className="w-full appearance-none rounded-full border border-white/10 bg-black/65 px-6 py-4 pr-12 text-white"
            value={selectedMake}
            onChange={(e) => setSelectedMake(e.target.value)}
          >
            <option value="">Select brand</option>
            {library.map((item) => (
              <option key={item.make} value={item.make}>
                {item.make}
              </option>
            ))}
          </select>
          <SelectArrow />
        </div>

        <div className="relative">
          <select
            className="w-full appearance-none rounded-full border border-white/10 bg-black/65 px-6 py-4 pr-12 text-white disabled:opacity-50"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            disabled={!selectedMake}
          >
            <option value="">Select model</option>
            {availableModels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <SelectArrow />
        </div>

        <div className="relative">
          <select
            className="w-full appearance-none rounded-full border border-white/10 bg-black/65 px-6 py-4 pr-12 text-white disabled:opacity-50"
            value={selectedEngineId}
            onChange={(e) => setSelectedEngineId(e.target.value)}
            disabled={!selectedModelId}
          >
            <option value="">Select engine</option>
            {availableEngines.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <SelectArrow />
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={handleFindFile}
          className="rounded-full bg-red-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-red-500"
        >
          Find a File
        </button>

        <button
          type="button"
          onClick={handleRequestCustomTune}
          className="rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white hover:bg-white/10"
        >
          Request Custom Tune
        </button>
      </div>
    </div>
  );
}
