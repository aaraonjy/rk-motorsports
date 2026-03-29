"use client";

import { useState } from "react";
import { Hero } from "@/components/hero";
import { VehicleSelector } from "@/components/vehicle-selector";
import { HomeServices } from "@/components/sections/home-services";
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

export default function HomePage() {
  const [result, setResult] = useState<ResultData | null>(null);

  const handleSearch = (data: VehicleSearchPayload) => {
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
      name: `${makeEntry.make} ${modelEntry.name} - ${engineEntry.name}`,
      stockHp: hp,
      stockTorque: torque,
      stage1Hp: Math.round(hp * 1.1),
      stage1Torque: Math.round(torque * 1.1),
      stage2Hp: Math.round(hp * 1.3),
      stage2Torque: Math.round(torque * 1.3),
    });
  };

  return (
    <>
      {/* SECTION 1: HERO */}
      <section className="bg-black/55 backdrop-blur-sm">
        <Hero />
      </section>

      {/* SECTION 2: COMPARE TUNING OPTIONS */}
      <section className="bg-black/70 py-20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:py-24">
        <div className="container-rk">
          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-12">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Compare tuning options
              </p>

              <h2 className="mt-3 text-3xl font-bold md:text-5xl">
                Compare file tuning options for your vehicle
              </h2>

              <p className="mt-4 max-w-3xl text-base leading-7 text-white/65 md:text-lg">
                Select your vehicle platform and ECU to preview estimated stock,
                Stage 1, and Stage 2 performance gains before submitting your
                tuning request.
              </p>
            </div>

            <VehicleSelector onSearch={handleSearch} />

            {result && (
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/70 p-6 text-white">
                <h3 className="mb-4 text-xl font-bold">{result.name}</h3>

                <div className="grid gap-4 text-center md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-white/60">Stock</p>
                    <p className="mt-2 text-lg font-semibold">
                      {result.stockHp} HP / {result.stockTorque} Nm
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-sm text-emerald-200/80">Stage 1</p>
                    <p className="mt-2 text-lg font-semibold text-emerald-300">
                      {result.stage1Hp} HP / {result.stage1Torque} Nm
                    </p>
                  </div>

                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                    <p className="text-sm text-red-200/80">Stage 2</p>
                    <p className="mt-2 text-lg font-semibold text-red-300">
                      {result.stage2Hp} HP / {result.stage2Torque} Nm
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-white/50">
                  Estimated values only. Actual results depend on hardware, fuel
                  quality, ECU type, and tuning conditions.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: SERVICES */}
      <section
        id="services"
        className="bg-zinc-900/90 py-20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:py-24"
      >
        <HomeServices />
      </section>
    </>
  );
}