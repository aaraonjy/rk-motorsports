"use client";

import { useEffect, useMemo, useState } from "react";
import carLibrary from "@/lib/car-library.json";
import ecuTypesData from "@/lib/ecu-types.json";
import ecuReadToolsData from "@/lib/ecu-read-tools.json";
import tcuTypesData from "@/lib/tcu-types.json";
import tcuReadToolsData from "@/lib/tcu-read-tools.json";
import fuelGradesData from "@/lib/fuel-grades.json";
import wmiOptionsData from "@/lib/wmi-options.json";
import {
  addOns,
  calculateAddOnTotal,
  calculateBaseTuneTotal,
  ecuTunes,
  getBundleLabel,
  tcuTunes,
  type TuningTypeOption,
  type TuneOption,
} from "@/lib/tuning-pricing";

type EngineOption = {
  id: string;
  name: string;
};

type ModelOption = {
  id: string;
  name: string;
  engines: EngineOption[];
};

type BrandOption = {
  make: string;
  models: ModelOption[];
};

type EcuReadToolsFile = {
  tools: string[];
};

type TcuReadToolsFile = {
  tools: string[];
};

type WmiOptionsFile = {
  options: string[];
};

type EcuTypeEntry = {
  family: string;
  models: string[];
};

type TcuTypeEntry = {
  family: string;
  models: string[];
};

type EcuTypesFile = Record<string, EcuTypeEntry[]>;
type TcuTypesFile = Record<string, TcuTypeEntry[]>;

type CustomTuningFormProps = {
  productId: string;
};

type EcuSetupStage = "stock" | "stage1" | "stage2" | "stage3" | "custom";
type TurboSetupOption =
  | "stock"
  | "oem_upgrade"
  | "hybrid"
  | "big_turbo"
  | "other";

const currentEcuSetupOptions: Array<{
  id: EcuSetupStage;
  name: string;
  shortDescription: string;
}> = [
  {
    id: "stock",
    name: "Stock",
    shortDescription: "Factory calibration setup",
  },
  {
    id: "stage1",
    name: "Stage 1",
    shortDescription: "Mild performance setup",
  },
  {
    id: "stage2",
    name: "Stage 2",
    shortDescription: "Bolt-on performance setup",
  },
  {
    id: "stage3",
    name: "Stage 3",
    shortDescription: "High-performance build setup",
  },
  {
    id: "custom",
    name: "Custom",
    shortDescription: "Custom or unknown setup",
  },
];

const turboSetupOptions: Array<{
  id: TurboSetupOption;
  name: string;
}> = [
  { id: "stock", name: "Stock Turbo" },
  { id: "oem_upgrade", name: "OEM Upgrade / Larger OEM Turbo" },
  { id: "hybrid", name: "Hybrid Turbo" },
  { id: "big_turbo", name: "Big Turbo" },
  { id: "other", name: "Others" },
];

function extractYearRange(modelName: string) {
  const match = modelName.match(/(19|20)\d{2}\s*-\s*((19|20)\d{2}|->)/);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function extractEngineCapacityCc(engineName: string) {
  const match = engineName.match(
    /(\d+(?:\.\d+)?)\s*(TFSI|TFSI-e|TFSi|TSI|TDI|TGI|FSI|i|D|T|G-Tron)/i
  );

  if (!match) return "";

  const liters = Number(match[1]);
  if (Number.isNaN(liters)) return "";

  return String(Math.round(liters * 1000));
}

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/50">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

function getTuningTypeCardClass(
  optionId: TuningTypeOption,
  active: boolean
): string {
  if (active) {
    if (optionId === "ECU") {
      return "border-sky-500 bg-sky-500/15 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]";
    }
    if (optionId === "TCU") {
      return "border-violet-500 bg-violet-500/15 shadow-[0_0_0_1px_rgba(139,92,246,0.35)]";
    }
    return "border-[#ff3b57] bg-[#ff3b57]/15 shadow-[0_0_0_1px_rgba(255,59,87,0.35)]";
  }

  if (optionId === "ECU") {
    return "border-white/10 bg-white/[0.03] hover:border-sky-500/40 hover:bg-sky-500/10";
  }
  if (optionId === "TCU") {
    return "border-white/10 bg-white/[0.03] hover:border-violet-500/40 hover:bg-violet-500/10";
  }
  return "border-white/10 bg-white/[0.03] hover:border-[#ff3b57]/40 hover:bg-[#ff3b57]/10";
}

function getTuneCardClass(kind: "ecu" | "tcu", itemId: string, active: boolean) {
  if (kind === "ecu") {
    if (active) {
      if (itemId === "stage1") {
        return "border-sky-500 bg-sky-500/15 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]";
      }
      if (itemId === "stage2") {
        return "border-amber-500 bg-amber-500/15 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]";
      }
      if (itemId === "stage3") {
        return "border-[#ff3b57] bg-[#ff3b57]/15 shadow-[0_0_0_1px_rgba(255,59,87,0.35)]";
      }
      return "border-fuchsia-500 bg-fuchsia-500/15 shadow-[0_0_0_1px_rgba(217,70,239,0.35)]";
    }

    if (itemId === "stage1") {
      return "border-white/10 bg-white/[0.03] hover:border-sky-500/40 hover:bg-sky-500/10";
    }
    if (itemId === "stage2") {
      return "border-white/10 bg-white/[0.03] hover:border-amber-500/40 hover:bg-amber-500/10";
    }
    if (itemId === "stage3") {
      return "border-white/10 bg-white/[0.03] hover:border-[#ff3b57]/40 hover:bg-[#ff3b57]/10";
    }
    return "border-white/10 bg-white/[0.03] hover:border-fuchsia-500/40 hover:bg-fuchsia-500/10";
  }

  if (active) {
    if (itemId === "stage1") {
      return "border-violet-500 bg-violet-500/15 shadow-[0_0_0_1px_rgba(139,92,246,0.35)]";
    }
    if (itemId === "stage2") {
      return "border-orange-500 bg-orange-500/15 shadow-[0_0_0_1px_rgba(249,115,22,0.35)]";
    }
    return "border-fuchsia-500 bg-fuchsia-500/15 shadow-[0_0_0_1px_rgba(217,70,239,0.35)]";
  }

  if (itemId === "stage1") {
    return "border-white/10 bg-white/[0.03] hover:border-violet-500/40 hover:bg-violet-500/10";
  }
  if (itemId === "stage2") {
    return "border-white/10 bg-white/[0.03] hover:border-orange-500/40 hover:bg-orange-500/10";
  }
  return "border-white/10 bg-white/[0.03] hover:border-fuchsia-500/40 hover:bg-fuchsia-500/10";
}

function getSetupCardClass(itemId: string, active: boolean) {
  if (active) {
    if (itemId === "stock") {
      return "border-slate-400/60 bg-slate-400/10 shadow-[0_0_0_1px_rgba(148,163,184,0.22)]";
    }
    if (itemId === "stage1") {
      return "border-sky-500 bg-sky-500/15 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]";
    }
    if (itemId === "stage2") {
      return "border-amber-500 bg-amber-500/15 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]";
    }
    if (itemId === "stage3") {
      return "border-[#ff3b57] bg-[#ff3b57]/15 shadow-[0_0_0_1px_rgba(255,59,87,0.35)]";
    }
    return "border-fuchsia-500 bg-fuchsia-500/15 shadow-[0_0_0_1px_rgba(217,70,239,0.35)]";
  }

  return "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]";
}

function getSummaryBoxClass(tuningType: TuningTypeOption, hasSelection: boolean) {
  if (!hasSelection) return "border-white/10 bg-white/[0.03]";

  if (tuningType === "ECU") {
    return "border-sky-500/30 bg-sky-500/10";
  }
  if (tuningType === "TCU") {
    return "border-violet-500/30 bg-violet-500/10";
  }
  return "border-[#ff3b57]/30 bg-[#ff3b57]/10";
}

function getSummaryLabelClass(
  tuningType: TuningTypeOption,
  hasSelection: boolean
) {
  if (!hasSelection) return "text-white/60";
  if (tuningType === "ECU") return "text-sky-200/80";
  if (tuningType === "TCU") return "text-violet-200/80";
  return "text-red-200/80";
}

function getSummaryHeading(tuningType: TuningTypeOption) {
  if (tuningType === "ECU_TCU") return "Selected package";
  return "Selected tune";
}

function getEmptySummaryText(tuningType: TuningTypeOption) {
  if (tuningType === "ECU") return "No ECU tune selected";
  if (tuningType === "TCU") return "No TCU tune selected";
  return "No package selected";
}

function getEmptyTotalText(tuningType: TuningTypeOption) {
  if (tuningType === "ECU") return "Select ECU tune";
  if (tuningType === "TCU") return "Select TCU tune";
  return "Select ECU and TCU stages";
}

function getRemarksPlaceholder(tuningType: TuningTypeOption) {
  if (tuningType === "ECU") {
    return "e.g. tuned for RON97, upgraded intake, daily driving setup, smoother throttle response, any special ECU-related request not covered above";
  }

  if (tuningType === "TCU") {
    return "e.g. smoother daily shifting, faster gear change, higher clutch pressure, revised shift points, any special TCU / gearbox request not covered above";
  }

  return "e.g. tuned for RON97, upgraded intake, daily driving setup, DSG focus on smoother shifting, any special request not covered above";
}

function getTcuVersionPlaceholder() {
  return "e.g. DQ381 Gen 2 / 0DL300012A";
}

function getTcuVersionHelpText() {
  return "Enter the gearbox software ID / version manually if available.";
}

function getFinalPriceNote(tuningType: TuningTypeOption) {
  if (tuningType === "ECU") {
    return "Final price is subject to change after file review, ECU verification, and vehicle setup complexity.";
  }

  if (tuningType === "TCU") {
    return "Final price is subject to change after file review, TCU verification, and vehicle setup complexity.";
  }

  return "Final price is subject to change after file review, ECU / TCU verification, and vehicle setup complexity.";
}

function getSmartRecommendedTcuStage(
  setupStage: EcuSetupStage | "",
  turboType: TurboSetupOption | ""
): "stage1" | "stage2" | "custom" | "" {
  if (setupStage === "stock" || setupStage === "stage1") {
    return "stage1";
  }

  if (setupStage === "stage2" || setupStage === "stage3") {
    return "stage2";
  }

  if (setupStage === "custom") {
    if (turboType === "big_turbo") {
      return "custom";
    }
    return "stage2";
  }

  return "";
}

function TuneCard({
  item,
  active,
  onSelect,
  kind,
  badge,
}: {
  item: TuneOption;
  active: boolean;
  onSelect: () => void;
  kind: "ecu" | "tcu";
  badge?: React.ReactNode;
}) {
  const primaryDescription = item.description?.[0] || "";
  const suitableLabel =
    item.suitableFor && item.suitableFor.length > 0
      ? item.suitableFor[0]
      : undefined;

  return (
    <label
      className={`flex min-h-[240px] cursor-pointer flex-col rounded-2xl border p-5 transition duration-200 hover:scale-[1.01] ${getTuneCardClass(
        kind,
        item.id,
        active
      )}`}
    >
      <input
        type="radio"
        className="sr-only"
        checked={active}
        onChange={onSelect}
      />

      <div>
        <p className="text-lg font-semibold text-white">{item.name}</p>
		
        {badge ? (
		  <div className="mt-2">
		    {badge}
		  </div>
		) : null}
      </div>
	  
      <p className="mt-2 text-white/75">RM {item.price.toLocaleString()}</p>

      <p className="mt-3 min-h-[72px] text-sm leading-6 text-white/60">
        {primaryDescription}
      </p>

      <div className="mt-auto pt-4">
        {suitableLabel ? (
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
            {suitableLabel}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function CompactSetupCard({
  title,
  description,
  active,
  onSelect,
  itemId,
}: {
  title: string;
  description: string;
  active: boolean;
  onSelect: () => void;
  itemId: string;
}) {
  return (
    <label
      className={`flex min-h-[112px] cursor-pointer flex-col justify-center rounded-2xl border p-4 transition duration-200 hover:scale-[1.01] ${getSetupCardClass(
        itemId,
        active
      )}`}
    >
      <input
        type="radio"
        className="sr-only"
        checked={active}
        onChange={onSelect}
      />

      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-5 text-white/60">{description}</p>
    </label>
  );
}

export function CustomTuningForm({ productId }: CustomTuningFormProps) {
  const [tuningType, setTuningType] = useState<TuningTypeOption>("ECU");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [isAddOnsOpen, setIsAddOnsOpen] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedEngineId, setSelectedEngineId] = useState("");

  const [manualYearRange, setManualYearRange] = useState("");
  const [manualCapacity, setManualCapacity] = useState("");

  const [ecuStage, setEcuStage] = useState("");
  const [tcuStage, setTcuStage] = useState("");

  const [currentEcuSetupStage, setCurrentEcuSetupStage] =
    useState<EcuSetupStage | "">("");
  const [turboType, setTurboType] = useState<TurboSetupOption | "">("");
  const [turboOther, setTurboOther] = useState("");

  const [ecuBrand, setEcuBrand] = useState("");
  const [ecuFamily, setEcuFamily] = useState("");
  const [ecuModel, setEcuModel] = useState("");
  const [ecuOther, setEcuOther] = useState("");

  const [ecuReadTool, setEcuReadTool] = useState("");
  const [ecuReadToolOther, setEcuReadToolOther] = useState("");

  const [tcuBrand, setTcuBrand] = useState("");
  const [tcuFamily, setTcuFamily] = useState("");
  const [tcuModel, setTcuModel] = useState("");
  const [tcuOther, setTcuOther] = useState("");
  const [tcuVersion, setTcuVersion] = useState("");

  const [tcuReadTool, setTcuReadTool] = useState("");
  const [tcuReadToolOther, setTcuReadToolOther] = useState("");

  const [fuelGrade, setFuelGrade] = useState("");
  const [fuelGradeOther, setFuelGradeOther] = useState("");

  const [wmiOption, setWmiOption] = useState("");
  const [wmiOther, setWmiOther] = useState("");

  const brands = useMemo(
    () =>
      [...(carLibrary as BrandOption[])].sort((a, b) =>
        a.make.localeCompare(b.make)
      ),
    []
  );

  const ecuTypes = useMemo(() => ecuTypesData as EcuTypesFile, []);
  const ecuBrands = useMemo(() => Object.keys(ecuTypes), [ecuTypes]);

  const tcuTypes = useMemo(() => tcuTypesData as TcuTypesFile, []);
  const tcuBrands = useMemo(() => {
    const brands = Object.keys(tcuTypes);
    const sorted = brands
      .filter((brand) => brand !== "Other")
      .sort((a, b) => a.localeCompare(b));

    if (brands.includes("Other")) {
      sorted.push("Other");
    }

    return sorted;
  }, [tcuTypes]);

  const ecuReadTools = useMemo(
    () => (ecuReadToolsData as EcuReadToolsFile).tools || [],
    []
  );

  const tcuReadTools = useMemo(() => {
    const tools = (tcuReadToolsData as TcuReadToolsFile).tools || [];
    const sorted = tools
      .filter((tool) => tool !== "Other (Specify)")
      .slice()
      .sort((a, b) => a.localeCompare(b));

    if (tools.includes("Other (Specify)")) {
      sorted.push("Other (Specify)");
    }

    return sorted;
  }, []);

  const fuelGrades = useMemo(() => (fuelGradesData as string[]) || [], []);
  const wmiOptions = useMemo(
    () =>
      ((wmiOptionsData as WmiOptionsFile).options || []).filter(
        (option) => option !== "No WMI"
      ),
    []
  );

  const selectedBrandData = useMemo(
    () => brands.find((brand) => brand.make === selectedBrand) || null,
    [brands, selectedBrand]
  );

  const availableModels = useMemo(
    () => selectedBrandData?.models || [],
    [selectedBrandData]
  );

  const selectedModelData = useMemo(
    () => availableModels.find((model) => model.id === selectedModelId) || null,
    [availableModels, selectedModelId]
  );

  const availableEngines = useMemo(
    () => selectedModelData?.engines || [],
    [selectedModelData]
  );

  const selectedEngineData = useMemo(
    () =>
      availableEngines.find((engine) => engine.id === selectedEngineId) || null,
    [availableEngines, selectedEngineId]
  );

  const derivedYearRange = useMemo(
    () => (selectedModelData ? extractYearRange(selectedModelData.name) : ""),
    [selectedModelData]
  );

  const derivedCapacity = useMemo(
    () =>
      selectedEngineData ? extractEngineCapacityCc(selectedEngineData.name) : "",
    [selectedEngineData]
  );

  const finalYearRange = useMemo(
    () => derivedYearRange || manualYearRange.trim(),
    [derivedYearRange, manualYearRange]
  );

  const finalCapacity = useMemo(
    () => derivedCapacity || manualCapacity.trim(),
    [derivedCapacity, manualCapacity]
  );

  const shouldShowYearFallback = !!selectedModelId && !derivedYearRange;
  const shouldShowCapacityFallback = !!selectedEngineId && !derivedCapacity;

  const selectedEcuBrandData = useMemo(
    () => (ecuBrand ? ecuTypes[ecuBrand] || [] : []),
    [ecuBrand, ecuTypes]
  );

  const availableEcuFamilies = useMemo(
    () => selectedEcuBrandData.map((item) => item.family),
    [selectedEcuBrandData]
  );

  const selectedEcuFamilyData = useMemo(
    () =>
      selectedEcuBrandData.find((item) => item.family === ecuFamily) || null,
    [selectedEcuBrandData, ecuFamily]
  );

  const availableEcuModels = useMemo(
    () => selectedEcuFamilyData?.models || [],
    [selectedEcuFamilyData]
  );

  const selectedTcuBrandData = useMemo(
    () => (tcuBrand ? tcuTypes[tcuBrand] || [] : []),
    [tcuBrand, tcuTypes]
  );

  const availableTcuFamilies = useMemo(
    () =>
      selectedTcuBrandData
        .map((item) => item.family)
        .sort((a, b) => a.localeCompare(b)),
    [selectedTcuBrandData]
  );

  const selectedTcuFamilyData = useMemo(
    () =>
      selectedTcuBrandData.find((item) => item.family === tcuFamily) || null,
    [selectedTcuBrandData, tcuFamily]
  );

  const availableTcuModels = useMemo(
    () =>
      (selectedTcuFamilyData?.models || [])
        .slice()
        .sort((a, b) => a.localeCompare(b)),
    [selectedTcuFamilyData]
  );

  const shouldShowEcuSection =
    tuningType === "ECU" || tuningType === "ECU_TCU";
  const shouldShowTcuSection =
    tuningType === "TCU" || tuningType === "ECU_TCU";
  const shouldShowFuelGrade = tuningType !== "TCU";
  const shouldShowTcuPreSetup = tuningType === "TCU";
  const shouldShowTurboSetupInEcuSection = tuningType === "ECU_TCU";

  const finalEcuType = useMemo(() => {
    if (!shouldShowEcuSection) return "";
    if (ecuBrand === "Other") return ecuOther.trim();
    return [ecuBrand, ecuFamily, ecuModel].filter(Boolean).join(" ").trim();
  }, [shouldShowEcuSection, ecuBrand, ecuFamily, ecuModel, ecuOther]);

  const finalTcuType = useMemo(() => {
    if (!shouldShowTcuSection) return "";
    if (tcuBrand === "Other") return tcuOther.trim();
    return [tcuBrand, tcuFamily, tcuModel].filter(Boolean).join(" ").trim();
  }, [shouldShowTcuSection, tcuBrand, tcuFamily, tcuModel, tcuOther]);

  const finalEcuReadTool = useMemo(() => {
    if (!shouldShowEcuSection) return "";
    if (ecuReadTool === "Other (Specify)") return ecuReadToolOther.trim();
    return ecuReadTool;
  }, [shouldShowEcuSection, ecuReadTool, ecuReadToolOther]);

  const finalTcuReadTool = useMemo(() => {
    if (!shouldShowTcuSection) return "";
    if (tcuReadTool === "Other (Specify)") return tcuReadToolOther.trim();
    return tcuReadTool;
  }, [shouldShowTcuSection, tcuReadTool, tcuReadToolOther]);

  const finalFuelGrade = useMemo(() => {
    if (!shouldShowFuelGrade) return "";
    if (fuelGrade === "Other (Specify)") return fuelGradeOther.trim();
    return fuelGrade;
  }, [shouldShowFuelGrade, fuelGrade, fuelGradeOther]);

  const finalWmiOption = useMemo(() => {
    if (!shouldShowEcuSection) return "";
    if (wmiOption === "Custom (Specify)") return wmiOther.trim();
    return wmiOption;
  }, [shouldShowEcuSection, wmiOption, wmiOther]);

  const finalTurboSetup = useMemo(() => {
    if (turboType === "other") return turboOther.trim();
    return turboType;
  }, [turboType, turboOther]);

  useEffect(() => {
    setSelectedModelId("");
    setSelectedEngineId("");
    setManualYearRange("");
    setManualCapacity("");
  }, [selectedBrand]);

  useEffect(() => {
    setSelectedEngineId("");
    setManualYearRange("");
    setManualCapacity("");
  }, [selectedModelId]);

  useEffect(() => {
    setManualCapacity("");
  }, [selectedEngineId]);

  useEffect(() => {
    setEcuFamily("");
    setEcuModel("");
    if (ecuBrand !== "Other") setEcuOther("");
  }, [ecuBrand]);

  useEffect(() => {
    setEcuModel("");
  }, [ecuFamily]);

  useEffect(() => {
    setTcuFamily("");
    setTcuModel("");
    if (tcuBrand !== "Other") setTcuOther("");
  }, [tcuBrand]);

  useEffect(() => {
    setTcuModel("");
  }, [tcuFamily]);

  useEffect(() => {
    if (ecuReadTool !== "Other (Specify)") setEcuReadToolOther("");
  }, [ecuReadTool]);

  useEffect(() => {
    if (tcuReadTool !== "Other (Specify)") setTcuReadToolOther("");
  }, [tcuReadTool]);

  useEffect(() => {
    if (fuelGrade !== "Other (Specify)") setFuelGradeOther("");
  }, [fuelGrade]);

  useEffect(() => {
    if (wmiOption !== "Custom (Specify)") setWmiOther("");
  }, [wmiOption]);

  useEffect(() => {
    if (turboType !== "other") setTurboOther("");
  }, [turboType]);

  useEffect(() => {
    if (tuningType === "ECU") {
      setTcuStage("");
      setTcuBrand("");
      setTcuFamily("");
      setTcuModel("");
      setTcuOther("");
      setTcuVersion("");
      setTcuReadTool("");
      setTcuReadToolOther("");
      setCurrentEcuSetupStage("");
      setTurboType("");
      setTurboOther("");
    }

    if (tuningType === "TCU") {
      setEcuStage("");
      setEcuBrand("");
      setEcuFamily("");
      setEcuModel("");
      setEcuOther("");
      setEcuReadTool("");
      setEcuReadToolOther("");
      setSelectedAddOns([]);
      setWmiOption("");
      setWmiOther("");
      setFuelGrade("");
      setFuelGradeOther("");
    }

    if (tuningType === "ECU_TCU") {
      setCurrentEcuSetupStage("");
    }
  }, [tuningType]);

  useEffect(() => {
    if (tuningType === "TCU") {
      const recommended = getSmartRecommendedTcuStage(
        currentEcuSetupStage,
        turboType
      );

      if (recommended) {
        setTcuStage(recommended);
      }
    }
  }, [currentEcuSetupStage, turboType, tuningType]);

  useEffect(() => {
    if (tuningType === "ECU_TCU") {
      const setupStage = (
        ecuStage === "stage1" ||
        ecuStage === "stage2" ||
        ecuStage === "stage3" ||
        ecuStage === "custom"
          ? ecuStage
          : ""
      ) as EcuSetupStage | "";

      const recommended = getSmartRecommendedTcuStage(setupStage, turboType);

      if (recommended) {
        setTcuStage(recommended);
      }
    }
  }, [ecuStage, turboType, tuningType]);

  function toggleAddOn(option: string) {
    setSelectedAddOns((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }

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

  const selectedEcuTune = useMemo(
    () => ecuTunes.find((item) => item.id === ecuStage) || null,
    [ecuStage]
  );

  const selectedTcuTune = useMemo(
    () => tcuTunes.find((item) => item.id === tcuStage) || null,
    [tcuStage]
  );

  const recommendedTcuStageForDisplay = useMemo(() => {
    if (tuningType === "TCU") {
      return getSmartRecommendedTcuStage(currentEcuSetupStage, turboType);
    }

    if (tuningType === "ECU_TCU") {
      const setupStage = (
        ecuStage === "stage1" ||
        ecuStage === "stage2" ||
        ecuStage === "stage3" ||
        ecuStage === "custom"
          ? ecuStage
          : ""
      ) as EcuSetupStage | "";

      return getSmartRecommendedTcuStage(setupStage, turboType);
    }

    return "";
  }, [tuningType, currentEcuSetupStage, ecuStage, turboType]);

  const selectedTuneLabel = useMemo(() => {
    if (tuningType === "ECU") {
      return selectedEcuTune?.name || "";
    }

    if (tuningType === "TCU") {
      return selectedTcuTune?.name || "";
    }

    if (!selectedEcuTune || !selectedTcuTune) {
      return "";
    }

    return getBundleLabel(ecuStage, tcuStage);
  }, [tuningType, selectedEcuTune, selectedTcuTune, ecuStage, tcuStage]);

  const disableSubmit =
    !selectedBrand ||
    !selectedModelId ||
    !selectedEngineId ||
    !finalYearRange ||
    !finalCapacity ||
    (shouldShowFuelGrade && !fuelGrade) ||
    (shouldShowEcuSection &&
      (!ecuStage ||
        !finalEcuType ||
        !finalEcuReadTool ||
        (shouldShowTurboSetupInEcuSection &&
          (!turboType || (turboType === "other" && !turboOther.trim()))) ||
        (ecuBrand === "Other" && !ecuOther.trim()) ||
        (ecuReadTool === "Other (Specify)" && !ecuReadToolOther.trim()))) ||
    (shouldShowTcuPreSetup &&
      (!currentEcuSetupStage ||
        !turboType ||
        (turboType === "other" && !turboOther.trim()))) ||
    (shouldShowTcuSection &&
      (!tcuStage ||
        !finalTcuType ||
        !finalTcuReadTool ||
        !tcuVersion.trim() ||
        (tcuBrand === "Other" && !tcuOther.trim()) ||
        (tcuReadTool === "Other (Specify)" && !tcuReadToolOther.trim()))) ||
    (shouldShowFuelGrade &&
      fuelGrade === "Other (Specify)" &&
      !fuelGradeOther.trim()) ||
    (wmiOption === "Custom (Specify)" && !wmiOther.trim());

  return (
    <form
      action="/api/orders"
      method="post"
      encType="multipart/form-data"
      className="grid gap-8 lg:grid-cols-[1.5fr_0.9fr]"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="tuningType" value={tuningType} />
      <input type="hidden" name="ecuStage" value={ecuStage} />
      <input type="hidden" name="tcuStage" value={tcuStage} />
      <input
        type="hidden"
        name="currentEcuSetupStage"
        value={currentEcuSetupStage}
      />
      <input type="hidden" name="turboType" value={finalTurboSetup} />
      <input type="hidden" name="selectedTuneLabel" value={selectedTuneLabel} />
      <input type="hidden" name="estimatedTotal" value={estimatedTotal || ""} />
      <input type="hidden" name="vehicleBrand" value={selectedBrand} />
      <input
        type="hidden"
        name="vehicleModel"
        value={selectedModelData?.name || ""}
      />
      <input
        type="hidden"
        name="engineModel"
        value={selectedEngineData?.name || ""}
      />
      <input type="hidden" name="vehicleYear" value={finalYearRange} />
      <input type="hidden" name="engineCapacity" value={finalCapacity} />
      <input type="hidden" name="ecuType" value={finalEcuType} />
      <input type="hidden" name="ecuReadTool" value={finalEcuReadTool} />
      <input type="hidden" name="fuelGrade" value={finalFuelGrade} />
      <input
        type="hidden"
        name="waterMethanolInjection"
        value={finalWmiOption}
      />
      <input type="hidden" name="tcuType" value={finalTcuType} />
      <input type="hidden" name="tcuReadTool" value={finalTcuReadTool} />
      <input type="hidden" name="tcuVersion" value={tcuVersion.trim()} />

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 1
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Select tuning type
          </h2>
          <p className="mt-3 text-white/65">
            Choose ECU only, TCU only, or ECU + TCU package.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { id: "ECU", title: "ECU Only", sub: "Engine tuning only" },
            { id: "TCU", title: "TCU Only", sub: "Transmission tuning only" },
            {
              id: "ECU_TCU",
              title: "ECU + TCU",
              sub: "Recommended full package",
            },
          ].map((option) => {
            const active = tuningType === option.id;

            return (
              <label
                key={option.id}
                className={`cursor-pointer rounded-2xl border p-5 transition ${getTuningTypeCardClass(
                  option.id as TuningTypeOption,
                  active
                )}`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="tuningTypeVisible"
                  checked={active}
                  onChange={() => setTuningType(option.id as TuningTypeOption)}
                />
                <p className="text-lg font-semibold text-white">
                  {option.title}
                </p>
                <p className="mt-2 text-sm text-white/65">{option.sub}</p>
              </label>
            );
          })}
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 2
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Select vehicle information
          </h2>
          <p className="mt-3 text-white/65">
            Choose the correct vehicle details to keep your tuning request
            accurate and compatible.
          </p>
        </div>

        <div
          className={`mt-8 grid gap-6 ${
            shouldShowFuelGrade ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          <div>
            <label className="label-rk">Vehicle Brand</label>
            <div className="relative">
              <select
                className="input-rk appearance-none pr-12"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                required
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand.make} value={brand.make}>
                    {brand.make}
                  </option>
                ))}
              </select>
              <SelectArrow />
            </div>
          </div>

          <div>
            <label className="label-rk">Model / Generation</label>
            <div className="relative">
              <select
                className="input-rk appearance-none pr-12"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={!selectedBrand}
                required
              >
                <option value="">Select model</option>
                {availableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <SelectArrow />
            </div>
          </div>

          <div>
            <label className="label-rk">Engine / Variant</label>
            <div className="relative">
              <select
                className="input-rk appearance-none pr-12"
                value={selectedEngineId}
                onChange={(e) => setSelectedEngineId(e.target.value)}
                disabled={!selectedModelId}
                required
              >
                <option value="">Select engine</option>
                {availableEngines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
              <SelectArrow />
            </div>
          </div>

          <div>
            <label className="label-rk">Year / Range</label>
            <input
              className="input-rk"
              value={derivedYearRange || manualYearRange}
              onChange={(e) => {
                if (shouldShowYearFallback) {
                  setManualYearRange(e.target.value);
                }
              }}
              placeholder={
                shouldShowYearFallback
                  ? "Enter year / range manually"
                  : "Auto-filled from model"
              }
              readOnly={!shouldShowYearFallback}
              required
            />
            {shouldShowYearFallback ? (
              <p className="mt-2 text-xs text-white/45">
                Auto-fill unavailable for this model. Please enter manually.
              </p>
            ) : null}
          </div>

          <div>
            <label className="label-rk">Engine Capacity (cc)</label>
            <input
              className="input-rk"
              value={derivedCapacity || manualCapacity}
              onChange={(e) => {
                if (shouldShowCapacityFallback) {
                  setManualCapacity(e.target.value);
                }
              }}
              placeholder={
                shouldShowCapacityFallback
                  ? "Enter engine capacity manually"
                  : "Auto-filled from engine"
              }
              readOnly={!shouldShowCapacityFallback}
              required
            />
            {shouldShowCapacityFallback ? (
              <p className="mt-2 text-xs text-white/45">
                Auto-fill unavailable for this engine. Please enter manually.
              </p>
            ) : null}
          </div>

          {shouldShowFuelGrade ? (
            <div>
              <label className="label-rk">Fuel Grade</label>
              <div className="relative">
                <select
                  className="input-rk appearance-none pr-12"
                  value={fuelGrade}
                  onChange={(e) => setFuelGrade(e.target.value)}
                  required
                >
                  <option value="">Select fuel grade</option>
                  {fuelGrades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
                <SelectArrow />
              </div>
            </div>
          ) : null}
        </div>

        {shouldShowFuelGrade && fuelGrade === "Other (Specify)" ? (
          <div className="mt-6">
            <label className="label-rk">Other Fuel Grade</label>
            <input
              className="input-rk"
              value={fuelGradeOther}
              onChange={(e) => setFuelGradeOther(e.target.value)}
              placeholder="Specify fuel grade"
              required
            />
          </div>
        ) : null}

        {shouldShowTcuPreSetup ? (
          <>
            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Step 3
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                ECU tuning setup
              </h2>
              <p className="mt-3 text-white/65">
                Select your current ECU stage first. Then choose your turbo
                setup so we can recommend the suitable TCU tune.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-5">
              {currentEcuSetupOptions.map((item) => (
                <CompactSetupCard
                  key={item.id}
                  title={item.name}
                  description={item.shortDescription}
                  active={currentEcuSetupStage === item.id}
                  onSelect={() => setCurrentEcuSetupStage(item.id)}
                  itemId={item.id}
                />
              ))}
            </div>

            <div className="mt-6 max-w-md">
              <label className="label-rk">Turbo Setup</label>
              <div className="relative mt-2">
                <select
                  className="input-rk appearance-none pr-12"
                  value={turboType}
                  onChange={(e) => setTurboType(e.target.value as TurboSetupOption)}
                  required
                >
                  <option value="">Select turbo setup</option>
                  {turboSetupOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <SelectArrow />
              </div>

              {turboType === "other" ? (
                <div className="mt-4">
                  <label className="label-rk">Other Turbo Setup</label>
                  <input
                    className="input-rk"
                    value={turboOther}
                    onChange={(e) => setTurboOther(e.target.value)}
                    placeholder="e.g. custom turbo setup, OEM swap, supercharger, or not sure"
                    required
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {shouldShowEcuSection ? (
          <>
            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Step 3
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                ECU tuning setup
              </h2>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {ecuTunes.map((item) => {
                const isActive = ecuStage === item.id;

                return (
                  <TuneCard
                    key={item.id}
                    item={item}
                    active={isActive}
                    onSelect={() => setEcuStage(item.id)}
                    kind="ecu"
                  />
                );
              })}
            </div>

            {shouldShowTurboSetupInEcuSection ? (
              <div className="mt-6 max-w-md">
                <label className="label-rk">Turbo Setup</label>
                <div className="relative mt-2">
                  <select
                    className="input-rk appearance-none pr-12"
                    value={turboType}
                    onChange={(e) => setTurboType(e.target.value as TurboSetupOption)}
                    required
                  >
                    <option value="">Select turbo setup</option>
                    {turboSetupOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>

                {turboType === "other" ? (
                  <div className="mt-4">
                    <label className="label-rk">Other Turbo Setup</label>
                    <input
                      className="input-rk"
                      value={turboOther}
                      onChange={(e) => setTurboOther(e.target.value)}
                      placeholder="e.g. custom turbo setup, OEM swap, supercharger, or not sure"
                      required
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="label-rk">ECU Type</label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="relative">
                    <select
                      className="input-rk appearance-none pr-12"
                      value={ecuBrand}
                      onChange={(e) => setEcuBrand(e.target.value)}
                      required
                    >
                      <option value="">Select ECU brand</option>
                      {ecuBrands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </select>
                    <SelectArrow />
                  </div>

                  <div className="relative">
                    <select
                      className="input-rk appearance-none pr-12"
                      value={ecuFamily}
                      onChange={(e) => setEcuFamily(e.target.value)}
                      disabled={!ecuBrand || ecuBrand === "Other"}
                    >
                      <option value="">
                        {ecuBrand === "Other"
                          ? "Not required"
                          : "Select ECU family"}
                      </option>
                      {availableEcuFamilies.map((family) => (
                        <option key={family} value={family}>
                          {family}
                        </option>
                      ))}
                    </select>
                    <SelectArrow />
                  </div>

                  <div className="relative">
                    <select
                      className="input-rk appearance-none pr-12"
                      value={ecuModel}
                      onChange={(e) => setEcuModel(e.target.value)}
                      disabled={!ecuFamily || ecuBrand === "Other"}
                    >
                      <option value="">
                        {ecuBrand === "Other"
                          ? "Not required"
                          : "Select ECU model"}
                      </option>
                      {availableEcuModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <SelectArrow />
                  </div>
                </div>

                {ecuBrand === "Other" ? (
                  <div className="mt-4">
                    <label className="label-rk">Other ECU Type</label>
                    <input
                      className="input-rk"
                      value={ecuOther}
                      onChange={(e) => setEcuOther(e.target.value)}
                      placeholder="Specify ECU type"
                      required
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <label className="label-rk">ECU Read Tool</label>
                <div className="relative">
                  <select
                    className="input-rk appearance-none pr-12"
                    value={ecuReadTool}
                    onChange={(e) => setEcuReadTool(e.target.value)}
                    required
                  >
                    <option value="">Select read tool</option>
                    {ecuReadTools.map((tool) => (
                      <option key={tool} value={tool}>
                        {tool}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>

              <div>
                <label className="label-rk">Water Methanol Injection</label>
                <div className="relative">
                  <select
                    className={`input-rk appearance-none pr-12 ${
                      !wmiOption ? "text-white/45" : "text-white"
                    }`}
                    value={wmiOption}
                    onChange={(e) => setWmiOption(e.target.value)}
                  >
                    <option value="">Optional</option>
                    {wmiOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>
            </div>

            {ecuReadTool === "Other (Specify)" ? (
              <div className="mt-6">
                <label className="label-rk">Other ECU Read Tool</label>
                <input
                  className="input-rk"
                  value={ecuReadToolOther}
                  onChange={(e) => setEcuReadToolOther(e.target.value)}
                  placeholder="Specify ECU read tool"
                  required
                />
              </div>
            ) : null}

            {wmiOption === "Custom (Specify)" ? (
              <div className="mt-6">
                <label className="label-rk">
                  Custom Water Methanol Injection
                </label>
                <input
                  className="input-rk"
                  value={wmiOther}
                  onChange={(e) => setWmiOther(e.target.value)}
                  placeholder="Specify WMI setup"
                  required
                />
              </div>
            ) : null}
          </>
        ) : null}

        {shouldShowTcuSection ? (
          <>
            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Step 4
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                TCU tuning setup
              </h2>

              {recommendedTcuStageForDisplay ? (
                <p className="mt-3 text-sm text-amber-300/85">
                  Recommended TCU tune selected automatically based on ECU setup
                  and turbo setup. You can still change it manually if needed.
                </p>
              ) : null}
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {tcuTunes.map((item) => {
                const isActive = tcuStage === item.id;
                const isRecommended = recommendedTcuStageForDisplay === item.id;

                return (
                  <TuneCard
                    key={item.id}
                    item={item}
                    active={isActive}
                    onSelect={() => setTcuStage(item.id)}
                    kind="tcu"
                    badge={
                      isRecommended ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                          Recommended
                        </span>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="label-rk">TCU Type / Transmission</label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="relative">
                    <select
                      className="input-rk appearance-none pr-12"
                      value={tcuBrand}
                      onChange={(e) => setTcuBrand(e.target.value)}
                      required
                    >
                      <option value="">Select manufacturer</option>
                      {tcuBrands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </select>
                    <SelectArrow />
                  </div>

                  <div className="relative">
                    <select
                      className="input-rk appearance-none pr-12"
                      value={tcuFamily}
                      onChange={(e) => setTcuFamily(e.target.value)}
                      disabled={!tcuBrand || tcuBrand === "Other"}
                    >
                      <option value="">
                        {tcuBrand === "Other"
                          ? "Not required"
                          : "Select TCU family"}
                      </option>
                      {availableTcuFamilies.map((family) => (
                        <option key={family} value={family}>
                          {family}
                        </option>
                      ))}
                    </select>
                    <SelectArrow />
                  </div>

                  <div className="relative">
                    <select
                      className="input-rk appearance-none pr-12"
                      value={tcuModel}
                      onChange={(e) => setTcuModel(e.target.value)}
                      disabled={!tcuFamily || tcuBrand === "Other"}
                    >
                      <option value="">
                        {tcuBrand === "Other"
                          ? "Not required"
                          : "Select TCU model"}
                      </option>
                      {availableTcuModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <SelectArrow />
                  </div>
                </div>

                {tcuBrand === "Other" ? (
                  <div className="mt-4">
                    <label className="label-rk">Other TCU Type</label>
                    <input
                      className="input-rk"
                      value={tcuOther}
                      onChange={(e) => setTcuOther(e.target.value)}
                      placeholder="Specify TCU type / transmission"
                      required
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <label className="label-rk">TCU Read Tool</label>
                <div className="relative">
                  <select
                    className="input-rk appearance-none pr-12"
                    value={tcuReadTool}
                    onChange={(e) => setTcuReadTool(e.target.value)}
                    required
                  >
                    <option value="">Select TCU read tool</option>
                    {tcuReadTools.map((tool) => (
                      <option key={tool} value={tool}>
                        {tool}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>

              <div>
                <label className="label-rk">TCU Version / Software ID</label>
                <input
                  className="input-rk"
                  value={tcuVersion}
                  onChange={(e) => setTcuVersion(e.target.value)}
                  placeholder={getTcuVersionPlaceholder()}
                  required
                />
                <p className="mt-2 text-xs text-white/45">
                  {getTcuVersionHelpText()}
                </p>
              </div>
            </div>

            {tcuReadTool === "Other (Specify)" ? (
              <div className="mt-6">
                <label className="label-rk">Other TCU Read Tool</label>
                <input
                  className="input-rk"
                  value={tcuReadToolOther}
                  onChange={(e) => setTcuReadToolOther(e.target.value)}
                  placeholder="Specify TCU read tool"
                  required
                />
              </div>
            ) : null}
          </>
        ) : null}

        {shouldShowEcuSection ? (
          <>
            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Step {shouldShowTcuSection ? "5" : "4"}
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Select add-on services
              </h2>
              <p className="mt-3 text-white/65">
                Add-on pricing applies to ECU tuning services.
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
              <div className="mt-8 grid gap-3">
                {addOns.map((option) => {
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
                          name="addOns"
                          value={option.name}
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
            ) : null}
          </>
        ) : null}

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step{" "}
            {shouldShowEcuSection && shouldShowTcuSection
              ? "6"
              : shouldShowEcuSection || shouldShowTcuSection
                ? "5"
                : "4"}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Upload stock file
            {shouldShowEcuSection && shouldShowTcuSection ? "s" : ""}
          </h2>
          <p className="mt-3 text-white/65">
            Please upload your original stock file for review.
          </p>
        </div>

        <div className="mt-6 text-sm text-white/60">
          <p>Allowed formats: .bin, .ori, .hex, .frf, .sgo</p>
          <p>Max recommended size: 10MB</p>
          <p>
            If you are unsure which file to upload, contact us before
            submitting.
          </p>
          <p className="mt-1 text-white/50">
            Your file will be handled securely and kept confidential.
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {shouldShowEcuSection ? (
            <div>
              <label className="label-rk">Original ECU File</label>
              <input
                className="input-rk cursor-pointer"
                name="ecuFile"
                type="file"
                required={shouldShowEcuSection}
              />
            </div>
          ) : null}

          {shouldShowTcuSection ? (
            <div>
              <label className="label-rk">Original TCU File</label>
              <input
                className="input-rk cursor-pointer"
                name="tcuFile"
                type="file"
                required={shouldShowTcuSection}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step{" "}
            {shouldShowEcuSection && shouldShowTcuSection
              ? "7"
              : shouldShowEcuSection || shouldShowTcuSection
                ? "6"
                : "5"}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Remarks</h2>
        </div>

        <div className="mt-6">
          <label className="label-rk">Remarks (Optional)</label>
          <textarea
            className="textarea-rk"
            name="remarks"
            placeholder={getRemarksPlaceholder(tuningType)}
          />
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          <p className="mb-2 font-semibold text-white">Important Notes</p>
          <ul className="space-y-1">
            <li>• Your uploaded file(s) will be handled confidentially</li>
            <li>• We do not share customer files with third parties</li>
            <li>• All tuning requests are reviewed manually before work begins</li>
          </ul>
        </div>

        <div className="mt-8">
          <button
            className="btn-primary px-8 py-3 text-sm tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disableSubmit}
          >
            Submit Tuning Request
          </button>
        </div>
      </div>

      <div className="h-fit rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
          Estimated price
        </p>

        <h2 className="mt-3 text-2xl font-semibold text-white">
          Price summary
        </h2>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm text-white/60">{getSummaryHeading(tuningType)}</p>

          {selectedTuneLabel ? (
            <>
              <p className="mt-2 text-lg font-semibold text-white">
                {selectedTuneLabel}
              </p>
              <p className="mt-1 text-white/70">
                RM {baseTuneTotal.toLocaleString()}
              </p>
            </>
          ) : (
            <p className="mt-2 text-white/50">{getEmptySummaryText(tuningType)}</p>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm text-white/60">Vehicle selection</p>

          {selectedBrand && selectedModelData && selectedEngineData ? (
            <div className="mt-3 space-y-2 text-sm text-white/75">
              <p>
                <span className="text-white/45">Brand:</span> {selectedBrand}
              </p>
              <p>
                <span className="text-white/45">Model:</span>{" "}
                {selectedModelData.name}
              </p>
              <p>
                <span className="text-white/45">Engine:</span>{" "}
                {selectedEngineData.name}
              </p>
              <p>
                <span className="text-white/45">Year / Range:</span>{" "}
                {finalYearRange || "-"}
              </p>
              <p>
                <span className="text-white/45">Engine Capacity:</span>{" "}
                {finalCapacity ? `${finalCapacity} cc` : "-"}
              </p>

              {tuningType === "TCU" ? (
                <>
                  <p>
                    <span className="text-white/45">Current ECU Setup:</span>{" "}
                    {currentEcuSetupOptions.find(
                      (item) => item.id === currentEcuSetupStage
                    )?.name || "-"}
                  </p>
                  <p>
                    <span className="text-white/45">Turbo Setup:</span>{" "}
                    {turboType === "other"
                      ? turboOther || "-"
                      : turboSetupOptions.find((item) => item.id === turboType)
                          ?.name || "-"}
                  </p>
                </>
              ) : null}

              {shouldShowEcuSection ? (
                <>
                  <p>
                    <span className="text-white/45">ECU Stage:</span>{" "}
                    {selectedEcuTune?.name || "-"}
                  </p>
                  {shouldShowTurboSetupInEcuSection ? (
                    <p>
                      <span className="text-white/45">Turbo Setup:</span>{" "}
                      {turboType === "other"
                        ? turboOther || "-"
                        : turboSetupOptions.find((item) => item.id === turboType)
                            ?.name || "-"}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-white/45">ECU Type:</span>{" "}
                    {finalEcuType || "-"}
                  </p>
                  <p>
                    <span className="text-white/45">ECU Read Tool:</span>{" "}
                    {finalEcuReadTool || "-"}
                  </p>
                </>
              ) : null}

              {shouldShowTcuSection ? (
                <>
                  <p>
                    <span className="text-white/45">TCU Stage:</span>{" "}
                    {selectedTcuTune?.name || "-"}
                  </p>
                  <p>
                    <span className="text-white/45">TCU Type:</span>{" "}
                    {finalTcuType || "-"}
                  </p>
                  <p>
                    <span className="text-white/45">TCU Read Tool:</span>{" "}
                    {finalTcuReadTool || "-"}
                  </p>
                  <p>
                    <span className="text-white/45">TCU Version:</span>{" "}
                    {tcuVersion || "-"}
                  </p>
                </>
              ) : null}

              {shouldShowFuelGrade ? (
                <p>
                  <span className="text-white/45">Fuel Grade:</span>{" "}
                  {finalFuelGrade || "-"}
                </p>
              ) : null}

              {shouldShowEcuSection ? (
                <p>
                  <span className="text-white/45">
                    Water Methanol Injection:
                  </span>{" "}
                  {finalWmiOption || "Not selected"}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/50">
              No vehicle selected yet.
            </p>
          )}
        </div>

        {shouldShowEcuSection ? (
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
                  const addOn = addOns.find((option) => option.name === item);

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
        ) : null}

        <div
          className={`mt-6 rounded-2xl border p-6 ${getSummaryBoxClass(
            tuningType,
            !!selectedTuneLabel
          )}`}
        >
          <p
            className={`text-sm uppercase tracking-[0.2em] ${getSummaryLabelClass(
              tuningType,
              !!selectedTuneLabel
            )}`}
          >
            Total estimated price
          </p>
          <p className="mt-3 text-4xl font-bold text-white">
            {selectedTuneLabel ? (
              `RM ${estimatedTotal.toLocaleString()}`
            ) : (
              <span className="text-2xl font-semibold text-white/50">
                {getEmptyTotalText(tuningType)}
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
          {getFinalPriceNote(tuningType)}
        </p>
      </div>
    </form>
  );
}