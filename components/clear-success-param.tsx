"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function ClearSuccessParam() {
  const params = useSearchParams();

  useEffect(() => {
    const success = params.get("success");

    if (!success) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("success");

    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [params]);

  return null;
}