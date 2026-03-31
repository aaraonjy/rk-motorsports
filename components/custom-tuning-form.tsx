"use client";

import { useEffect, useMemo, useState } from "react";
import carLibrary from "@/lib/car-library.json";
import ecuTypesData from "@/lib/ecu-types.json";
import ecuReadToolsData from "@/lib/ecu-read-tools.json";
import fuelGradesData from "@/lib/fuel-grades.json";
import wmiOptionsData from "@/lib/wmi-options.json";
import { addOns, baseTunes } from "@/lib/tuning-pricing";

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
  name: string;
  version: string;
  description: string;
  tools: string[];
};

type WmiOptionsFile = {
  options: string[];
};

type EcuTypeEntry = {
  family: string;
  models: string[];
};

type EcuTypesFile = Record<string, EcuTypeEntry[]>;

type CustomTuningFormProps = {
  productId: string;
};

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

export function CustomTuningForm({ productId }: CustomTuningFormProps) {
  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [isAddOnsOpen, setIsAddOnsOpen] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedEngineId, setSelectedEngineId] = useState("");

  const [manualYearRange, setManualYearRange] = useState("");
  const [manualCapacity, setManualCapacity] = useState("");

  const [ecuBrand, setEcuBrand] = useState("");
  const [ecuFamily, setEcuFamily] = useState("");
  const [ecuModel, setEcuModel] = useState("");
  const [ecuOther, setEcuOther] = useState("");

  const [ecuReadTool, setEcuReadTool] = useState("");
  const [ecuReadToolOther, setEcuReadToolOther] = useState("");

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

  const ecuReadTools = useMemo(
    () => (ecuReadToolsData as EcuReadToolsFile).tools || [],
    []
  );

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

  const shouldShowYearFallback =
    !!selectedModelId && !derivedYearRange;

  const shouldShowCapacityFallback =
    !!selectedEngineId && !derivedCapacity;

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

  const finalEcuType = useMemo(() => {
    if (ecuBrand === "Other") {
      return ecuOther.trim();
    }

    return [ecuBrand, ecuFamily, ecuModel].filter(Boolean).join(" ").trim();
  }, [ecuBrand, ecuFamily, ecuModel, ecuOther]);

  const finalEcuReadTool = useMemo(() => {
    if (ecuReadTool === "Other (Specify)") {
      return ecuReadToolOther.trim();
    }
    return ecuReadTool;
  }, [ecuReadTool, ecuReadToolOther]);

  const finalFuelGrade = useMemo(() => {
    if (fuelGrade === "Other (Specify)") {
      return fuelGradeOther.trim();
    }
    return fuelGrade;
  }, [fuelGrade, fuelGradeOther]);

  const finalWmiOption = useMemo(() => {
    if (wmiOption === "Custom (Specify)") {
      return wmiOther.trim();
    }
    return wmiOption;
  }, [wmiOption, wmiOther]);

  const activeTune = useMemo(
    () => baseTunes.find((item) => item.id === selectedTune) || null,
    [selectedTune]
  );

  const addOnTotal = useMemo(
    () =>
      selectedAddOns.reduce((total, selectedName) => {
        const addOn = addOns.find((item) => item.name === selectedName);
        return total + (addOn?.price || 0);
      }, 0),
    [selectedAddOns]
  );

  const estimatedTotal = (activeTune?.price || 0) + addOnTotal;

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
    if (ecuBrand !== "Other") {
      setEcuOther("");
    }
  }, [ecuBrand]);

  useEffect(() => {
    setEcuModel("");
  }, [ecuFamily]);

  useEffect(() => {
    if (ecuReadTool !== "Other (Specify)") {
      setEcuReadToolOther("");
    }
  }, [ecuReadTool]);

  useEffect(() => {
    if (fuelGrade !== "Other (Specify)") {
      setFuelGradeOther("");
    }
  }, [fuelGrade]);

  useEffect(() => {
    if (wmiOption !== "Custom (Specify)") {
      setWmiOther("");
    }
  }, [wmiOption]);

  function toggleAddOn(option: string) {
    setSelectedAddOns((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }

  const disableSubmit =
    !selectedBrand ||
    !selectedModelId ||
    !selectedEngineId ||
    !finalYearRange ||
    !finalCapacity ||
    !finalEcuType ||
    !selectedTune ||
    !ecuReadTool ||
    !fuelGrade ||
    (ecuBrand === "Other" && !ecuOther.trim()) ||
    (ecuReadTool === "Other (Specify)" && !ecuReadToolOther.trim()) ||
    (fuelGrade === "Other (Specify)" && !fuelGradeOther.trim()) ||
    (wmiOption === "Custom (Specify)" && !wmiOther.trim());

  return (
    <form
      action="/api/orders"
      method="post"
      encType="multipart/form-data"
      className="grid gap-8 lg:grid-cols-[1.5fr_0.9fr]"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="selectedTune" value={selectedTune} />
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

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 1
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Select vehicle information
          </h2>
          <p className="mt-3 text-white/65">
            Choose the correct vehicle details to keep your tuning request
            accurate and compatible.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
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
            </div>
          </div>

          <div>
            <label className="label-rk">Year / Range</label>
            <input
              className="input-rk"
              value={derivedYearRange || manualYearRange}
              onChange={(e) => setManualYearRange(e.target.value)}
              placeholder={
                derivedYearRange
                  ? "Auto-filled from model"
                  : "Enter year / range manually (e.g. 2015 - 2018)"
              }
              readOnly={!!derivedYearRange}
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
              onChange={(e) => setManualCapacity(e.target.value)}
              placeholder={
                derivedCapacity
                  ? "Auto-filled from engine"
                  : "Enter engine capacity manually (e.g. 2000)"
              }
              readOnly={!!derivedCapacity}
              required
            />
            {shouldShowCapacityFallback ? (
              <p className="mt-2 text-xs text-white/45">
                Auto-fill unavailable for this engine. Please enter manually.
              </p>
            ) : null}
          </div>

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
              </div>

              <div className="relative">
                <select
                  className="input-rk appearance-none pr-12"
                  value={ecuFamily}
                  onChange={(e) => setEcuFamily(e.target.value)}
                  disabled={!ecuBrand || ecuBrand === "Other"}
                  required={ecuBrand !== "Other"}
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
              </div>

              <div className="relative">
                <select
                  className="input-rk appearance-none pr-12"
                  value={ecuModel}
                  onChange={(e) => setEcuModel(e.target.value)}
                  disabled={!ecuFamily || ecuBrand === "Other"}
                >
                  <option value="">
                    {ecuBrand === "Other" ? "Not required" : "Select ECU model"}
                  </option>
                  {availableEcuModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>

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
            </div>
          </div>

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

        {fuelGrade === "Other (Specify)" ? (
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

        {wmiOption === "Custom (Specify)" ? (
          <div className="mt-6">
            <label className="label-rk">Custom Water Methanol Injection</label>
            <input
              className="input-rk"
              value={wmiOther}
              onChange={(e) => setWmiOther(e.target.value)}
              placeholder="Specify WMI setup"
              required
            />
          </div>
        ) : null}

        <div className="mt-3 text-xs text-white/45">
          Select brand, model, engine, and ECU type from the list to keep your
          order details consistent and reduce compatibility mistakes.
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 2
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Select tuning package
          </h2>
          <p className="mt-3 text-white/65">
            Select one base package before choosing additional options.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {baseTunes.map((item) => {
            const isActive = selectedTune === item.id;

            return (
              <label
                key={item.id}
                className={`cursor-pointer rounded-2xl border p-5 text-left transition ${
                  isActive
                    ? "border-[#ff3b57] bg-[#ff3b57]/15 shadow-[0_0_0_1px_rgba(255,59,87,0.35)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <input
                  type="radio"
                  name="tunePackage"
                  value={item.name}
                  checked={isActive}
                  onChange={() => setSelectedTune(item.id)}
                  className="sr-only"
                  required
                />
                <p className="text-lg font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-white/70">
                  RM {item.price.toLocaleString()}
                </p>
              </label>
            );
          })}
        </div>

        <div className="mt-12">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                Step 3
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Select add-on services
              </h2>
              <p className="mt-3 text-white/65">
                Add-on pricing may vary depending on the selected options.
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
                    !selectedTune
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
                      disabled={!selectedTune}
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

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 4
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Upload ECU file
          </h2>
          <p className="mt-3 text-white/65">
            Please upload your original stock ECU file for review.
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

        <div className="mt-6">
          <label className="label-rk">Original ECU File</label>
          <input
            className="input-rk cursor-pointer"
            name="file"
            type="file"
            required
          />
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Step 5
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Remarks</h2>
        </div>

        <div className="mt-6">
          <label className="label-rk">Remarks (Optional)</label>
          <textarea
            className="textarea-rk"
            name="remarks"
            placeholder="e.g. tuned for RON97, upgraded intake, daily driving setup, aggressive burble, any special request not covered above"
          />
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          <p className="mb-2 font-semibold text-white">Important Notes</p>
          <ul className="space-y-1">
            <li>• Your uploaded ECU file will be handled confidentially</li>
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
              <p>
                <span className="text-white/45">ECU Type:</span>{" "}
                {finalEcuType || "-"}
              </p>
              <p>
                <span className="text-white/45">ECU Read Tool:</span>{" "}
                {finalEcuReadTool || "-"}
              </p>
              <p>
                <span className="text-white/45">Fuel Grade:</span>{" "}
                {finalFuelGrade || "-"}
              </p>
              <p>
                <span className="text-white/45">Water Methanol Injection:</span>{" "}
                {finalWmiOption || "Not selected"}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/50">
              No vehicle selected yet.
            </p>
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
          Final price is subject to change after file review, ECU type
          verification, and vehicle setup complexity.
        </p>
      </div>
    </form>
  );
}