"use client";

import { useCallback, useEffect } from "react";
import {
  useLicenseStore,
  type LicenseClientProjection,
} from "@/stores/license-store";

function isProjection(value: unknown): value is LicenseClientProjection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LicenseClientProjection>;
  return (
    typeof candidate.status === "string" &&
    typeof candidate.message === "string" &&
    Array.isArray(candidate.features)
  );
}

export function useLicense() {
  const projection = useLicenseStore((state) => state.projection);
  const isLoading = useLicenseStore((state) => state.isLoading);
  const error = useLicenseStore((state) => state.error);
  const setProjection = useLicenseStore((state) => state.setProjection);
  const setLoading = useLicenseStore((state) => state.setLoading);
  const setError = useLicenseStore((state) => state.setError);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/license/status", {
        cache: "no-store",
        headers: { "x-requested-with": "sahelflow" },
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isProjection(payload)) {
        throw new Error("License authority returned an invalid response");
      }
      setProjection(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "License authority is unavailable");
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading, setProjection]);

  useEffect(() => {
    if (!projection && !error) void refresh();
  }, [error, projection, refresh]);

  return { projection, isLoading, error, refresh };
}
