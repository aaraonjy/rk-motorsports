"use client";

import { useState } from "react";
import { VehicleSelector } from "@/components/vehicle-selector";
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

type ResultData = {
  name: string;
  stockHp: number;
  stockTorque: number;
  stage1Hp: number;
  stage1Torque: number;
  stage2Hp: number;
  stage2Torque: number;
};

function parsePower(engineName: string) {
  const hpMatch = engineName.match(/(\d+)\s*hp/i);
  const torqueMatch = engineName.match(/(\d+)\s*Nm/i);

  const hp = hpMatch ? Number(hpMatch[1]) : 0;
  const torque = torqueMatch ? Number(torqueMatch[1]) : 0;

  return { hp, torque };
}

export default function ShopPage() {
  const [result, setResult] = useState<ResultData | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (data: VehicleSearchPayload) => {
    setHasSearched(true);

    const library = carLibrary as Make[];

    const makeEntry = library.find((item) => item.make === data.make);
    const modelEntry = makeEntry?.models.find((item) => item.name === data.model);
    const engineEntry = modelEntry?.engines.find((item) => item.name === data.engine);

    if (!makeEntry || !modelEntry || !engineEntry) {
      setResult(null);
      return;
    }

    const { hp, torque } = parsePower(engineEntry.name);

    setResult({
      name: `${makeEntry.make} ${modelEntry.name} ${engineEntry.name}`,
      stockHp: hp,
      stockTorque: torque,
      stage1Hp: Math.round(hp * 1.1),
      stage1Torque: Math.round(torque * 1.1),
      stage2Hp: Math.round(hp * 1.3),
      stage2Torque: Math.round(torque * 1.3),
    });
  };

  return (
    <section className="flex min-h-[calc(100vh-80px)] items-center pt-24">
      <div className="container-rk flex w-full justify-center">
        <div className="w-full max-w-6xl rounded-[2rem] border border-white/15 bg-black/55 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-md md:p-12">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Compare tuning options
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white md:text-5xl">
              Compare file tuning options for your vehicle
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/70 md:text-lg">
              Select your vehicle platform and ECU to browse available tuning
              services, ready-made files, and custom file options.
            </p>
          </div>

          <VehicleSelector onSearch={handleSearch} />

          <div id="find-a-file-result">
            {result && (
              <div className="mt-8 rounded-2xl border border-white/10 bg-[#151515] p-6 text-white md:p-8">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
                    Performance Preview
                  </p>
                  <h3 className="mt-3 text-xl font-bold md:text-2xl">
                    {result.name}
                  </h3>
                </div>

                <div className="grid gap-4 text-center md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                    <p className="text-sm text-white/55">Stock</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {result.stockHp} HP
                    </p>
                    <p className="mt-2 text-base text-white/70">
                      {result.stockTorque} Nm
                    </p>
                  </div>

                  <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
                    <p className="text-sm text-red-200/80">Stage 1</p>
                    <p className="mt-3 text-3xl font-semibold text-red-300">
                      {result.stage1Hp} HP
                    </p>
                    <p className="mt-2 text-base text-red-200/85">
                      {result.stage1Torque} Nm
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
                    <p className="text-sm text-amber-200/80">Stage 2</p>
                    <p className="mt-3 text-3xl font-semibold text-amber-300">
                      {result.stage2Hp} HP
                    </p>
                    <p className="mt-2 text-base text-amber-200/85">
                      {result.stage2Torque} Nm
                    </p>
                  </div>
                </div>

                <p className="mt-6 text-sm leading-6 text-white/45">
                  Estimated values only. Actual results depend on hardware,
                  fuel quality, ECU type, and tuning conditions.
                </p>
              </div>
            )}

            {hasSearched && !result && (
              <div className="mt-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-6 text-sm text-yellow-100">
                No matching file result found for the selected vehicle.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}