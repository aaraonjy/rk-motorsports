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
      ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
      : result.tone === "neutral"
        ? "border-gray-600 bg-gray-900/80 text-gray-200"
        : "border-red-500 bg-red-500/15 text-red-200";

  return (
    <div className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm backdrop-blur-md ${resultClassName}`}>
      {result.message}
    </div>
  );
}
