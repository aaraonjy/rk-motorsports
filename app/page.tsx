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
    <main className="bg-black text-white">
      {/* SECTION 1 */}
      <Hero />

      {/* SECTION 2 */}
      <section className="bg-[#0a0a0a] py-20 md:py-24">
        <div className="container-rk">
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-[#111111] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-12">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-500/80">
                Compare tuning options
              </p>

              <h2 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
                Compare file tuning options for your vehicle
              </h2>

              <p className="mt-5 max-w-3xl text-base leading-7 text-white/65 md:text-lg">
                Select your vehicle platform and ECU to preview estimated stock,
                Stage 1, and Stage 2 performance gains before submitting your
                tuning request.
              </p>
            </div>

            <VehicleSelector onSearch={handleSearch} />

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
          </div>
        </div>
      </section>

      {/* SECTION 3 */}
      <section id="services" className="bg-[#121212] py-20 md:py-24">
        <div className="container-rk">
          <div className="rounded-[2rem] border border-white/10 bg-[#171717] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-8">
            <HomeServices />
          </div>
        </div>
      </section>
    </main>
  );
}