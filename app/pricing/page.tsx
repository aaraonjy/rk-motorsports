"use client";

import { useMemo, useState } from "react";

const baseTunes = [
  { id: "stage123", name: "Stage 1 / 2 / 3 Performance Tuning", price: 1500 },
  { id: "custom", name: "Custom ECU Calibration", price: 1800 },
  { id: "multimap", name: "Multi-Map Switching (On-The-Fly)", price: 1800 },
];

const addOns = [
  "Boosted Launch Control (2-Step)",
  "Rolling Anti-Lag (RAL)",
  "Pop & Bang / Flame Tuning",
  "EGR Off",
  "Lambda / Decat / O2 Off",
  "DTC Off",
  "Speed Limiter Removal",
  "Cold Start Delete",
  "MAF Off",
  "Start Stop Disable",
];

const ADD_ON_PRICE = 300;

export default function PricingPage() {
  const [selectedTune, setSelectedTune] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  const activeTune = useMemo(
    () => baseTunes.find((item) => item.id === selectedTune) || null,
    [selectedTune]
  );

  const addOnTotal = selectedAddOns.length * ADD_ON_PRICE;
  const estimatedTotal = (activeTune?.price || 0) + addOnTotal;

  function toggleAddOn(option: string) {
    setSelectedAddOns((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }

  return (
    <section className="pt-28 pb-20">
      <div className="container-rk">
        <h1 className="text-4xl font-bold text-white md:text-5xl">Pricing</h1>

        <p className="mt-4 max-w-3xl text-white/70">
          Select your base tuning package and any additional options to estimate
          your total price. Final quotation may still vary depending on vehicle
          model, ECU type, and tuning complexity.
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Base tune
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Choose your tuning package
              </h2>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {baseTunes.map((item) => {
                const isActive = selectedTune === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedTune(item.id)}
                    className={`rounded-2xl border p-5 text-left transition ${
                      isActive
                        ? "border-[#ff3b57] bg-[#ff3b57]/15 shadow-[0_0_0_1px_rgba(255,59,87,0.35)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <p className="text-lg font-semibold text-white">{item.name}</p>
                    <p className="mt-2 text-white/70">RM {item.price.toLocaleString()}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Additional options
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Select add-on services
              </h2>
              <p className="mt-3 text-white/65">
                Each additional option costs RM {ADD_ON_PRICE}.
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              {addOns.map((option) => {
                const checked = selectedAddOns.includes(option);

                return (
                  <label
                    key={option}
                    className={`flex items-center justify-between rounded-2xl border px-5 py-4 transition ${
                      checked
                        ? "border-[#ff3b57] bg-[#ff3b57]/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                    } ${!selectedTune ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!selectedTune}
                        onChange={() => toggleAddOn(option)}
                        className="h-4 w-4 accent-[#ff3b57]"
                      />
                      <span className="text-white">{option}</span>
                    </div>

                    <span className="text-sm font-medium text-white/70">
                      RM {ADD_ON_PRICE}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Estimated price
            </p>

            <h2 className="mt-3 text-2xl font-semibold text-white">
              Price summary
            </h2>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm text-white/60">Selected tune</p>

              {activeTune ? (
                <>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {activeTune.name}
                  </p>
                  <p className="mt-1 text-white/70">
                    RM {activeTune.price.toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-white/50">No tuning package selected</p>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm text-white/60">Additional options</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {selectedAddOns.length} selected
              </p>
              <p className="mt-1 text-white/70">
                RM {addOnTotal.toLocaleString()}
              </p>

              {selectedAddOns.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-white/65">
                  {selectedAddOns.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-white/50">
                  No additional options selected.
                </p>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-[#ff3b57]/10 p-6">
              <p className="text-sm uppercase tracking-[0.2em] text-white/60">
                Total estimated price
              </p>
              <p className="mt-3 text-4xl font-bold text-white">
                {activeTune ? (
                  `RM ${estimatedTotal.toLocaleString()}`
                ) : (
                  <span className="text-2xl font-semibold text-white/50">
                    Select a package
                  </span>
                )}
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm text-white/60">Payment Method</p>
              <p className="mt-2 text-lg font-semibold text-white">
                Bank Transfer
              </p>
              <p className="mt-3 text-sm text-white/60">
                PayPal integration will be added in the future.
              </p>
            </div>

            <p className="mt-6 text-sm leading-6 text-white/55">
              This is an estimated price only. Final quotation may vary based on
              ECU type, vehicle setup, and requested tuning complexity.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}