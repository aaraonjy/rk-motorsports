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
    <main className="bg-black text-white">
      {/* SECTION 1 */}
      <Hero />

      {/* SECTION 2 */}
      <section className="bg-[#0a0a0a] py-20 md:py-24">
        <div className="container-rk">
          <div className="grid gap-8 xl:grid-cols-[1.05fr_1.25fr] xl:items-start">
            <div className="rounded-[2rem] border border-white/10 bg-[#111111] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-500/80">
                Compare tuning options
              </p>

              <h2 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
                Compare file tuning options for your vehicle
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-white/65 md:text-lg">
                Select your vehicle platform and ECU to preview estimated stock,
                Stage 1, and Stage 2 performance gains before submitting your
                tuning request.
              </p>

              <div className="mt-8">
                <VehicleSelector onSearch={handleSearch} />
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[#151515] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
                    Performance preview
                  </p>
                  <h3 className="mt-3 text-2xl font-bold md:text-3xl">
                    Estimated output
                  </h3>
                </div>

                <div className="hidden rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/45 md:block">
                  Reference only
                </div>
              </div>

              {result ? (
                <>
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
                    <p className="text-sm text-white/50">Selected vehicle</p>
                    <h4 className="mt-2 text-lg font-semibold">{result.name}</h4>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-center">
                      <p className="text-sm text-white/55">Stock</p>
                      <p className="mt-3 text-xl font-semibold">
                        {result.stockHp} HP
                      </p>
                      <p className="mt-1 text-sm text-white/65">
                        {result.stockTorque} Nm
                      </p>
                    </div>

                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-center">
                      <p className="text-sm text-red-200/75">Stage 1</p>
                      <p className="mt-3 text-xl font-semibold text-red-300">
                        {result.stage1Hp} HP
                      </p>
                      <p className="mt-1 text-sm text-red-200/80">
                        {result.stage1Torque} Nm
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                      <p className="text-sm text-white/55">Stage 2</p>
                      <p className="mt-3 text-xl font-semibold">
                        {result.stage2Hp} HP
                      </p>
                      <p className="mt-1 text-sm text-white/65">
                        {result.stage2Torque} Nm
                      </p>
                    </div>
                  </div>

                  <p className="mt-6 text-sm leading-6 text-white/45">
                    Estimated values only. Actual results depend on hardware,
                    fuel quality, ECU type, and tuning conditions.
                  </p>
                </>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/25 p-8 text-center">
                  <p className="text-base text-white/55">
                    Select your vehicle details and click the button to preview
                    estimated performance gains.
                  </p>
                </div>
              )}
            </div>
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