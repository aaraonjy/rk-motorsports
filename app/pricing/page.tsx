"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addOns,
  calculateAddOnTotal,
  calculateBaseTuneTotal,
  ecuTunes,
  getAddOnByName,
  getBundleLabel,
  getRecommendedTcuStage,
  getTuneSelectionPrompt,
  getTuningTypeLabel,
  tcuTunes,
  tuningTypeOptions,
  type AddOn,
  type TuningTypeOption,
} from "@/lib/tuning-pricing";
import { SharedTuneCard } from "@/components/tune-option-card";

function getTuningTypeCardClasses(
  optionId: TuningTypeOption,
  active: boolean
) {
  const styles = {
    ECU: {
      active:
        "border-sky-400 bg-sky-500/15 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]",
      idle:
        "border-white/10 bg-white/[0.03] hover:border-sky-400/40 hover:bg-sky-500/10",
    },
    TCU: {
      active:
        "border-violet-400 bg-violet-500/15 shadow-[0_0_0_1px_rgba(167,139,250,0.35)]",
      idle:
        "border-white/10 bg-white/[0.03] hover:border-violet-400/40 hover:bg-violet-500/10",
    },
    ECU_TCU: {
      active:
        "border-[#ff3b57] bg-[#ff3b57]/15 shadow-[0_0_0_1px_rgba(255,59,87,0.35)]",
      idle:
        "border-white/10 bg-white/[0.03] hover:border-[#ff3b57]/40 hover:bg-[#ff3b57]/10",
    },
  } as const;

  return active ? styles[optionId].active : styles[optionId].idle;
}

function getTotalBoxClass(tuningType: TuningTypeOption, hasSelection: boolean) {
  if (!hasSelection) return "border-white/10 bg-white/[0.03]";

  if (tuningType === "ECU") return "border-sky-400/30 bg-sky-500/10";
  if (tuningType === "TCU") return "border-violet-400/30 bg-violet-500/10";
  return "border-[#ff3b57]/30 bg-[#ff3b57]/10";
}

function getTotalLabelClass(
  tuningType: TuningTypeOption,
  hasSelection: boolean
) {
  if (!hasSelection) return "text-white/60";
  if (tuningType === "ECU") return "text-sky-200/80";
  if (tuningType === "TCU") return "text-violet-200/80";
  return "text-red-200/80";
}

function getAddOnGroups(options: AddOn[]) {
  const performanceNames = new Set([
    "Pop & Bang / Flame Tuning",
    "Boosted Launch Control (2-Step)",
    "Rolling Anti-Lag (RAL)",
    "Multi-Map Switching (On-The-Fly)",
    "DSG Fart (Only for DSG Gearbox)",
  ]);

  const utilityNames = new Set(["Speed Limiter Removal"]);
  const advancedNames = new Set(["Immo Off"]);

  const performance = options.filter((item) => performanceNames.has(item.name));
  const utility = options.filter((item) => utilityNames.has(item.name));
  const advanced = options.filter((item) => advancedNames.has(item.name));

  return [
    { title: "Performance Add-ons", items: performance },
    { title: "Utility", items: utility },
    { title: "Advanced / Special", items: advanced },
  ].filter((group) => group.items.length > 0);
}

export default function PricingPage() {
  const [tuningType, setTuningType] = useState<TuningTypeOption>("ECU");
  const [ecuStage, setEcuStage] = useState("");
  const [tcuStage, setTcuStage] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [isAddOnsOpen, setIsAddOnsOpen] = useState(false);

  const shouldShowEcuSection =
    tuningType === "ECU" || tuningType === "ECU_TCU";
  const shouldShowTcuSection =
    tuningType === "TCU" || tuningType === "ECU_TCU";

  const addOnGroups = useMemo(() => getAddOnGroups(addOns), []);

  useEffect(() => {
    if (tuningType === "ECU") {
      setTcuStage("");
    }

    if (tuningType === "TCU") {
      setEcuStage("");
      setSelectedAddOns([]);
      setIsAddOnsOpen(false);
    }
  }, [tuningType]);

  useEffect(() => {
    if (tuningType === "ECU_TCU") {
      if (!ecuStage) {
        setTcuStage("");
        return;
      }

      const recommended = getRecommendedTcuStage(ecuStage);

      if (recommended) {
        setTcuStage(recommended);
      }
    }
  }, [ecuStage, tuningType]);

  const selectedEcuTune = useMemo(
    () => ecuTunes.find((item) => item.id === ecuStage) || null,
    [ecuStage]
  );

  const selectedTcuTune = useMemo(
    () => tcuTunes.find((item) => item.id === tcuStage) || null,
    [tcuStage]
  );

  const baseTuneTotal = useMemo(
    () =>
      calculateBaseTuneTotal({
        tuningType,
        ecuStage,
        tcuStage,
      }),
    [tuningType, ecuStage, tcuStage]
  );

  const addOnTotal = useMemo(
    () => (shouldShowEcuSection ? calculateAddOnTotal(selectedAddOns) : 0),
    [selectedAddOns, shouldShowEcuSection]
  );

  const estimatedTotal = baseTuneTotal + addOnTotal;

  const selectedTuneLabel = useMemo(() => {
    if (tuningType === "ECU") return selectedEcuTune?.name || "";
    if (tuningType === "TCU") return selectedTcuTune?.name || "";
    return getBundleLabel(ecuStage, tcuStage);
  }, [tuningType, selectedEcuTune, selectedTcuTune, ecuStage, tcuStage]);

  const selectionPrompt = useMemo(
    () => getTuneSelectionPrompt(tuningType, ecuStage, tcuStage),
    [tuningType, ecuStage, tcuStage]
  );

  const summaryTitle = selectedTuneLabel || getTuningTypeLabel(tuningType);
  const hasBaseSelection = !selectionPrompt && baseTuneTotal > 0;

  function toggleAddOn(option: string) {
    setSelectedAddOns((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }

  return (
    <section className="pb-20 pt-28">
      <div className="container-rk">
        <h1 className="text-4xl font-bold text-white md:text-5xl">Pricing</h1>

        <p className="mt-4 max-w-3xl leading-relaxed text-white/70">
          Select ECU, TCU, or ECU + TCU to estimate your total price.
        </p>

        <p className="mt-2 max-w-3xl leading-relaxed text-white/70">
          Final pricing may vary depending on vehicle model, ECU/TCU type, and
          tuning complexity.
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Tuning type
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Choose your package type
              </h2>
              <p className="mt-3 text-white/65">
                Pricing page and custom tuning form now follow the same shared
                configuration.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {tuningTypeOptions.map((option) => {
                const active = tuningType === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTuningType(option.id)}
                    className={`rounded-2xl border p-5 text-left transition ${getTuningTypeCardClasses(
                      option.id,
                      active
                    )}`}
                  >
                    <p className="text-lg font-semibold text-white">
                      {option.title}
                    </p>
                    <p className="mt-2 text-sm text-white/65">{option.sub}</p>
                  </button>
                );
              })}
            </div>

            {shouldShowEcuSection ? (
              <>
                <div className="mt-12">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                    ECU tune
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    Select ECU stage
                  </h2>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {ecuTunes.map((item) => {
                    const isActive = ecuStage === item.id;

                    return (
                      <SharedTuneCard
                        key={item.id}
                        item={item}
                        active={isActive}
                        onSelect={() => setEcuStage(item.id)}
                        kind="ecu"
                        as="button"
                      />
                    );
                  })}
                </div>
              </>
            ) : null}

            {shouldShowTcuSection ? (
              <>
                <div className="mt-12">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                    TCU tune
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    Select TCU stage
                  </h2>
                  {(tuningType === "ECU_TCU" || tuningType === "TCU") &&
                  getRecommendedTcuStage(ecuStage) ? (
                    <p className="mt-3 text-sm text-amber-300/85">
                      Recommended TCU tune is selected automatically based on
                      the ECU stage. You can still change it manually if needed.
                    </p>
                  ) : null}
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {tcuTunes.map((item) => {
                    const isActive = tcuStage === item.id;
                    const isRecommended =
                      tuningType === "ECU_TCU" &&
                      getRecommendedTcuStage(ecuStage) === item.id;

                    return (
                      <SharedTuneCard
                        key={item.id}
                        item={item}
                        active={isActive}
                        onSelect={() => setTcuStage(item.id)}
                        kind="tcu"
                        as="button"
                        badge={
                          isRecommended ? (
                            <span className="inline-flex w-fit rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                              Recommended
                            </span>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </>
            ) : null}

            {shouldShowEcuSection ? (
              <>
                <div className="mt-12">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                    Additional options
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    Select add-on services
                  </h2>
                  <p className="mt-3 text-white/65">
                    Add-on pricing applies when ECU tuning is included.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-white/65">
                      Add-ons apply only when ECU tuning is included.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddOnsOpen((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    {isAddOnsOpen ? "Hide Add-On Services" : "Show Add-On Services"}
                  </button>
                </div>

                {isAddOnsOpen ? (
                  <div className="mt-8 space-y-8">
                    {addOnGroups.map((group) => (
                      <div key={group.title}>
                        <div className="mb-4">
                          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                            {group.title}
                          </p>
                        </div>

                        <div className="grid gap-3">
                          {group.items.map((option) => {
                            const checked = selectedAddOns.includes(option.name);

                            return (
                              <label
                                key={option.name}
                                className={`flex items-center justify-between rounded-2xl border px-5 py-4 transition ${
                                  checked
                                    ? "border-[#ff3b57] bg-[#ff3b57]/10"
                                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                                } ${
                                  !ecuStage
                                    ? "cursor-not-allowed opacity-50"
                                    : "cursor-pointer"
                                }`}
                              >
                                <div className="flex items-center gap-4">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!ecuStage}
                                    onChange={() => toggleAddOn(option.name)}
                                    className="h-4 w-4 accent-[#ff3b57]"
                                  />
                                  <span className="text-white">{option.name}</span>
                                </div>

                                <span className="text-sm font-medium text-white/70">
                                  RM {option.price}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Estimated price
            </p>

            <h2 className="mt-3 text-2xl font-semibold text-white">
              Price summary
            </h2>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm text-white/60">Selected package</p>

              <p className="mt-2 text-lg font-semibold text-white">
                {summaryTitle}
              </p>

              {hasBaseSelection ? (
                <p className="mt-1 text-white/70">
                  RM {baseTuneTotal.toLocaleString()}
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/50">{selectionPrompt}</p>
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
                  {selectedAddOns.map((item) => {
                    const addOn = getAddOnByName(item);

                    return (
                      <li key={item}>
                        • {item} — RM {addOn?.price ?? 0}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-white/50">
                  No additional options selected.
                </p>
              )}
            </div>

            <div
              className={`mt-6 rounded-2xl border p-6 ${getTotalBoxClass(
                tuningType,
                hasBaseSelection
              )}`}
            >
              <p
                className={`text-sm uppercase tracking-[0.2em] ${getTotalLabelClass(
                  tuningType,
                  hasBaseSelection
                )}`}
              >
                Total estimated price
              </p>

              <p className="mt-3 text-4xl font-bold text-white">
                {hasBaseSelection ? (
                  `RM ${estimatedTotal.toLocaleString()}`
                ) : (
                  <span className="text-2xl font-semibold text-white/50">
                    {selectionPrompt}
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
              This is an estimated price only. Final quotation may vary based on{" "}
              {tuningType === "ECU"
                ? "ECU type"
                : tuningType === "TCU"
                  ? "TCU type"
                  : "ECU / TCU type"}
              , vehicle setup, and requested tuning complexity.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}