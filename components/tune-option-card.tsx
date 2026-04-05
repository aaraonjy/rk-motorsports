"use client";

import type { ReactNode } from "react";
import type { TuneOption } from "@/lib/tuning-pricing";

export function getSharedTuneCardClass(
  kind: "ecu" | "tcu",
  itemId: string,
  active: boolean
) {
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

type SharedTuneCardProps = {
  item: TuneOption;
  active: boolean;
  onSelect: () => void;
  kind: "ecu" | "tcu";
  badge?: ReactNode;
  as?: "label" | "button";
};

export function SharedTuneCard({
  item,
  active,
  onSelect,
  kind,
  badge,
  as = "label",
}: SharedTuneCardProps) {
  const primaryDescription = item.description?.[0] || "";
  const suitableLabel =
    item.suitableFor && item.suitableFor.length > 0
      ? item.suitableFor[0]
      : undefined;

  const className = `flex min-h-[240px] cursor-pointer flex-col rounded-2xl border p-5 text-left transition duration-200 hover:scale-[1.01] ${getSharedTuneCardClass(
    kind,
    item.id,
    active
  )}`;

  const content = (
    <>
      <div>
        <p className="text-lg font-semibold text-white">{item.name}</p>

        {badge ? <div className="mt-2">{badge}</div> : null}
      </div>

      <p className="mt-2 text-white/75">RM {item.price.toLocaleString()}</p>

      <p className="mt-3 min-h-[72px] text-sm leading-6 text-white/60">
        {primaryDescription}
      </p>

      <div className="mt-auto pt-4 flex justify-center">
        {suitableLabel ? (
          <span className="inline-flex min-w-[140px] justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60 text-center">
            {suitableLabel}
          </span>
        ) : null}
      </div>
    </>
  );

  if (as === "button") {
    return (
      <button type="button" onClick={onSelect} className={className}>
        {content}
      </button>
    );
  }

  return (
    <label className={className}>
      <input
        type="radio"
        className="sr-only"
        checked={active}
        onChange={onSelect}
      />
      {content}
    </label>
  );
}
