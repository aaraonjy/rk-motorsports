"use client";

import { Hero } from "@/components/hero";
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
  const handleSearch = (data: VehicleSearchPayload): ResultData | null => {
    const library = carLibrary as Make[];

    const makeEntry = library.find((item) => item.make === data.make);
    const modelEntry = makeEntry?.models.find(
      (item) => item.name === data.model
    );
    const engineEntry = modelEntry?.engines.find(
      (item) => item.name === data.engine
    );

    if (!makeEntry || !modelEntry || !engineEntry) {
      return null;
    }

    const { hp, torque } = parsePower(engineEntry.name);

    return {
      name: `${makeEntry.make} ${modelEntry.name} - ${engineEntry.name}`,
      stockHp: hp,
      stockTorque: torque,
      stage1Hp: Math.round(hp * 1.1),
      stage1Torque: Math.round(torque * 1.1),
      stage2Hp: Math.round(hp * 1.3),
      stage2Torque: Math.round(torque * 1.3),
    };
  };

  return (
    <>
      {/* ✅ HERO (NOW HANDLES SEARCH + RESULT) */}
      <section className="bg-black/55 backdrop-blur-sm">
        <Hero onSearch={handleSearch} />
      </section>

      {/* ✅ SERVICES */}
      <section
        id="services"
        className="bg-zinc-900/90 py-20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:py-24"
      >
        <HomeServices />
      </section>
    </>
  );
}