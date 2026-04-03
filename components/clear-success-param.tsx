"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function ClearSuccessParam() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const success = params.get("success");

    if (success) {
      const url = new URL(window.location.href);
      url.searchParams.delete("success");

      router.replace(url.pathname, { scroll: false });
    }
  }, []);

  return null;
}