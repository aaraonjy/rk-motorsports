"use client";

import { useEffect, useState } from "react";

type CleanupState =
  | { tone: "success"; message: string }
  | { tone: "neutral"; message: string }
  | { tone: "error"; message: string }
  | null;

export function CleanupAuditLogsResult() {
  const [result, setResult] = useState<CleanupState>(null);

  useEffect(() => {
    function handleEvent(event: Event) {
      const customEvent = event as CustomEvent<CleanupState>;
      setResult(customEvent.detail);
    }

    window.addEventListener("rk-audit-cleanup-result", handleEvent as EventListener);
    return () => {
      window.removeEventListener("rk-audit-cleanup-result", handleEvent as EventListener);
    };
  }, []);

  if (!result) return null;

  const resultClassName =
    result.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : result.tone === "neutral"
        ? "border-white/15 bg-white/5 text-white/70"
        : "border-red-500/30 bg-red-500/10 text-red-200";

  return (
    <div className={`mt-4 max-w-xl rounded-2xl border px-4 py-3 text-sm ${resultClassName}`}>
      {result.message}
    </div>
  );
}
