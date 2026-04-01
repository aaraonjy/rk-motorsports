export type TuneStage = "stage1" | "stage2" | "stage3" | "custom";
export type TuningTypeOption = "ECU" | "TCU" | "ECU_TCU";

export type TuneOption = {
  id: TuneStage;
  name: string;
  price: number;
  description?: string[];
  suitableFor?: string[];
};

export type AddOn = {
  name: string;
  price: number;
};

export const ecuTunes: TuneOption[] = [
  {
    id: "stage1",
    name: "Stage 1 ECU Tune",
    price: 1200,
    description: [
      "Optimized for stock or lightly modified setups",
      "Improved throttle response and drivability",
      "Safe daily-use calibration",
    ],
    suitableFor: ["Stock turbo", "Basic bolt-ons"],
  },
  {
    id: "stage2",
    name: "Stage 2 ECU Tune",
    price: 2000,
    description: [
      "For supporting hardware upgrades",
      "Higher power and torque targets",
      "Sharper performance response",
    ],
    suitableFor: ["Downpipe", "Intake", "Intercooler upgrades"],
  },
  {
    id: "stage3",
    name: "Stage 3 ECU Tune",
    price: 3000,
    description: [
      "For high-output turbo setups",
      "Requires proper supporting mods",
      "Built for serious performance applications",
    ],
    suitableFor: ["Big turbo", "High power builds"],
  },
  {
    id: "custom",
    name: "Custom ECU Tune",
    price: 3500,
    description: [
      "Tailored calibration for unique setups",
      "Ideal for non-standard hardware combinations",
      "Recommended for advanced tuning goals",
    ],
    suitableFor: ["Hybrid turbo", "Built engine", "Special requests"],
  },
];

export const tcuTunes: TuneOption[] = [
  {
    id: "stage1",
    name: "TCU Stage 1",
    price: 2300,
    description: [
      "Mild increase in torque limit",
      "Slightly faster shifts",
      "Better daily driving",
      "Minimal clutch pressure increase",
    ],
    suitableFor: ["Stock turbo", "ECU Stage 1"],
  },
  {
    id: "stage2",
    name: "TCU Stage 2",
    price: 2900,
    description: [
      "Higher torque limit",
      "Increased clutch pressure",
      "Faster and firmer shifts",
      "Optimized shift points",
    ],
    suitableFor: ["ECU Stage 2", "ECU Stage 3", "Hybrid turbo"],
  },
  {
    id: "custom",
    name: "Custom TCU Tune",
    price: 3500,
    description: [
      "Maximum torque-limit strategy based on setup",
      "Higher clutch pressure to reduce slip",
      "More aggressive shifting if required",
      "Launch and shift behavior tailored to the build",
    ],
    suitableFor: ["Big turbo", "Track / drag setups", "Special gearbox behavior"],
  },
];

const rawAddOns: AddOn[] = [
  { name: "Boosted Launch Control (2-Step)", price: 400 },
  { name: "Rolling Anti-Lag (RAL)", price: 500 },
  { name: "Pop & Bang / Flame Tuning", price: 300 },
  { name: "Multi-Map Switching (On-The-Fly)", price: 600 },
  { name: "EGR Off", price: 200 },
  { name: "Lambda / Decat / O2 Off", price: 300 },
  { name: "DTC Off", price: 200 },
  { name: "Speed Limiter Removal", price: 200 },
  { name: "Cold Start Delete", price: 200 },
  { name: "MAF Off", price: 300 },
  { name: "Start Stop Disable", price: 200 },
];

export const addOns: AddOn[] = [...rawAddOns].sort((a, b) => {
  if (a.price !== b.price) return a.price - b.price;
  return a.name.localeCompare(b.name);
});

export function getAddOnByName(name: string) {
  return addOns.find((item) => item.name === name) || null;
}

export function calculateAddOnTotal(selectedAddOns: string[]) {
  return selectedAddOns.reduce((total, selectedName) => {
    const addOn = getAddOnByName(selectedName);
    return total + (addOn?.price || 0);
  }, 0);
}

export function getEcuTuneByStage(stage: string) {
  return ecuTunes.find((item) => item.id === stage) || null;
}

export function getTcuTuneByStage(stage: string) {
  return tcuTunes.find((item) => item.id === stage) || null;
}

export function getRecommendedTcuStage(ecuStage: string): TuneStage | "" {
  if (ecuStage === "stage1") return "stage1";
  if (ecuStage === "stage2") return "stage2";
  if (ecuStage === "stage3") return "stage2";
  if (ecuStage === "custom") return "custom";
  return "";
}

export function getBundleLabel(ecuStage: string, tcuStage: string) {
  const ecu = getEcuTuneByStage(ecuStage);
  const tcu = getTcuTuneByStage(tcuStage);

  if (!ecu || !tcu) return "ECU + TCU Package";
  return `${ecu.name} + ${tcu.name} Package`;
}

export function calculateBaseTuneTotal({
  tuningType,
  ecuStage,
  tcuStage,
}: {
  tuningType: TuningTypeOption;
  ecuStage?: string;
  tcuStage?: string;
}) {
  const ecuPrice = ecuStage ? getEcuTuneByStage(ecuStage)?.price || 0 : 0;
  const tcuPrice = tcuStage ? getTcuTuneByStage(tcuStage)?.price || 0 : 0;

  if (tuningType === "ECU") return ecuPrice;
  if (tuningType === "TCU") return tcuPrice;

  const combined = ecuPrice + tcuPrice;

  if (!ecuStage || !tcuStage) return combined;

  if (ecuStage === "stage1" && tcuStage === "stage1") return Math.max(combined - 300, 0);
  if (ecuStage === "stage2" && tcuStage === "stage2") return Math.max(combined - 400, 0);
  if (ecuStage === "stage3" && tcuStage === "stage2") return Math.max(combined - 500, 0);
  if (ecuStage === "custom" || tcuStage === "custom") return Math.max(combined - 300, 0);

  return Math.max(combined - 250, 0);
}

export const baseTunes = ecuTunes;