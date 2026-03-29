"use client";

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

export function Hero({
  onSearch,
}: {
  onSearch: (data: any) => ResultData | null;
}) {
  const [result, setResult] = useState<ResultData | null>(null);

  const handleSearch = (data: any) => {
    const res = onSearch(data);
    setResult(res);
  };

  return (
    <section className="relative flex min-h-[72vh] items-center justify-center overflow-hidden pt-24">
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/70" />

      <div className="container-rk relative z-10 flex flex-col items-center py-20 text-center">

        <h1 className="text-4xl font-bold text-white md:text-6xl">
          Compare file tuning options for your vehicle
        </h1>

        <p className="mt-6 text-white/70">
          Select your vehicle and ECU to see estimated performance gains
        </p>

        {/* ✅ CONNECTED SELECTOR */}
        <div className="mt-10 w-full max-w-4xl">
          <VehicleSelector onSearch={handleSearch} />
        </div>

        {/* ✅ RESULT DISPLAY */}
        {result && (
          <div className="mt-10 w-full max-w-4xl rounded-2xl bg-black p-6 text-white">
            <h3 className="mb-4 text-xl font-bold">{result.name}</h3>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-white/5 rounded-xl">
                Stock: {result.stockHp} HP / {result.stockTorque} Nm
              </div>
              <div className="p-4 bg-green-500/10 rounded-xl">
                Stage 1: {result.stage1Hp} HP / {result.stage1Torque} Nm
              </div>
              <div className="p-4 bg-red-500/10 rounded-xl">
                Stage 2: {result.stage2Hp} HP / {result.stage2Torque} Nm
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}