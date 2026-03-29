"use client";

import { useMemo, useState } from "react";

const baseTunes = [
  { id: "stage1", name: "Stage 1 ECU Tune", price: 1500 },
  { id: "stage2", name: "Stage 2 ECU Tune", price: 2200 },
  { id: "custom", name: "Custom File Service", price: 1800 },
];

const addOns = [
  "EGR off",
  "Lambda / Decat / O2 Off",
  "Pops and Bangs",
  "DTC off",
  "Speed Limiter Removal",
  "Cold Start Delete",
  "Launch Control",
  "MAF off",
  "Start Stop Disable",
];

const ADD_ON_PRICE = 300;

type CustomTuningFormProps = {
  productId: string;
};

export function CustomTuningForm({ productId }: CustomTuningFormProps) {
  const [selectedTune, setSelectedTune] = useState<string>("");
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
    <form
      action="/api/orders"
      method="post"
      encType="multipart/form-data"
      className="grid gap-8 lg:grid-cols-[1.5fr_0.9fr]"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="selectedTune" value={selectedTune} />
      <input type="hidden" name="estimatedTotal" value={estimatedTotal || ""} />

      <div className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="label-rk">Vehicle Brand</label>
            <input
              className="input-rk"
              name="vehicleBrand"
              placeholder="e.g. Volkswagen, Audi, BMW, Mazda"
              required
            />
          </div>

          <div>
            <label className="label-rk">Vehicle Model</label>
            <input
              className="input-rk"
              name="vehicleModel"
              placeholder="e.g. Golf GTI MK7, A4 B9, 320i, Mazda 3 MPS"
              required
            />
          </div>

          <div>
            <label className="label-rk">Engine / Variant</label>
            <input
              className="input-rk"
              name="engineModel"
              placeholder="e.g. 2.0 TSI, 1.8T, EA888 Gen 3, B58"
              required
            />
          </div>

          <div>
            <label className="label-rk">Engine Capacity (cc)</label>
            <input
              className="input-rk"
              name="engineCapacity"
              placeholder="e.g. 1984"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="label-rk">Year</label>
            <input
              className="input-rk"
              name="vehicleYear"
              placeholder="e.g. 2011, 2018, 2022"
              required
            />
          </div>

          <div>
            <label className="label-rk">ECU / TCU</label>
            <input
              className="input-rk"
              name="ecuType"
              placeholder="e.g. Bosch MED17, MG1, DQ250, DQ381"
              required
            />
          </div>
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Base tune
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Choose your tuning package
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
                    name="addOns"
                    value={option}
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

        <div className="mt-12">
          <label className="label-rk">Special Requests (Optional)</label>
          <textarea
            className="textarea-rk"
            name="remarks"
            placeholder="e.g. tuned for RON97, upgraded intake, daily driving setup, aggressive burble, any special request not covered above"
          />
          <p className="mt-2 text-xs text-white/45">
            Use this only for extra details not already covered by the selections
            above.
          </p>
        </div>

        <div className="mt-10 text-sm text-white/60">
          <p>Please upload your original stock ECU file.</p>
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

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          <p className="mb-2 font-semibold text-white">Important Notes</p>
          <ul className="space-y-1">
            <li>• Your uploaded ECU file will be handled confidentially</li>
            <li>• We do not share customer files with third parties</li>
            <li>• All tuning requests are reviewed manually before work begins</li>
            <li>• Final quotation may vary based on ECU type and complexity</li>
          </ul>
        </div>

        <div className="mt-8">
          <button
            className="btn-primary px-8 py-3 text-sm tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedTune}
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
          This is an estimated price only. Final quotation may vary based on ECU
          type, vehicle setup, and requested tuning complexity.
        </p>
      </div>
    </form>
  );
}