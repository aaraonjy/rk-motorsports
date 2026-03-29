"use client";

import Link from "next/link";
import { useState } from "react";
import { VehicleSelector } from "@/components/vehicle-selector";

type ResultData = {
  name: string;
  stockHp: number;
  stockTorque: number;
  stage1Hp: number;
  stage1Torque: number;
  stage2Hp: number;
  stage2Torque: number;
};

type VehicleSearchPayload = {
  make: string;
  model: string;
  engine: string;
};

export function Hero({
  onSearch,
}: {
  onSearch: (data: VehicleSearchPayload) => ResultData | null;
}) {
  const [result, setResult] = useState<ResultData | null>(null);

  const handleSearch = (data: VehicleSearchPayload) => {
    const res = onSearch(data);
    setResult(res);
  };

  return (
    <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04),transparent_55%)]" />

      <div className="container-rk relative z-10 flex flex-col items-center justify-center py-20 text-center md:py-24">
        <h1 className="max-w-5xl text-4xl font-bold uppercase leading-[0.95] text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)] md:text-6xl xl:text-7xl">
          Unlock Your Engine’s True Performance
        </h1>

        <p className="mt-8 max-w-3xl text-lg leading-8 text-white/75 md:text-xl md:leading-9">
          Upload your ECU file, request custom tuning, and receive optimized
          performance maps — fast, secure, and built for real results.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/custom-tuning"
            className="rounded-full bg-red-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-red-500"
          >
            Start Tuning
          </Link>

          <Link
            href="/shop"
            className="rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
          >
            Browse Files
          </Link>
        </div>

        <div className="mt-6 text-sm text-white/60">
          ✔ Fast turnaround&nbsp;&nbsp;✔ Professional calibration&nbsp;&nbsp;✔
          Secure file handling
        </div>

        <div className="mt-14 w-full max-w-5xl rounded-[2rem] border border-white/10 bg-black/45 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
          <div className="mb-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Compare tuning options
            </p>
            <h2 className="mt-3 text-2xl font-bold text-white md:text-4xl">
              Compare file tuning options for your vehicle
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/65 md:text-base">
              Select your vehicle platform and ECU to preview estimated stock,
              Stage 1, and Stage 2 performance gains before submitting your
              tuning request.
            </p>
          </div>

          <VehicleSelector onSearch={handleSearch} />

          {result && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/70 p-6 text-left text-white">
              <h3 className="mb-5 text-xl font-bold">{result.name}</h3>

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
  );
}