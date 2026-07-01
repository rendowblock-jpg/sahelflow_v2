/**
 * useLicense — client-side license hook.
 *
 * On mount, checks the stored license:
 *   - If no license: self-issues a 7-day trial
 *   - If license exists: validates it (signature, machine ID, expiry, version)
 *   - Returns the validation result
 *
 * In dev mode: bypasses validation (returns "valid")
 */
"use client";

import { useEffect, useState } from "react";
import { useLicenseStore } from "@/stores/license-store";
import { getMachineId, shortMachineId } from "@/lib/license/machine-id";
import { validateLicense, issueTrial } from "@/lib/license/license-service";
import { env } from "@/lib/env";


export function useLicense() {
  const license = useLicenseStore((s) => s.license);
  const setLicense = useLicenseStore((s) => s.setLicense);
  const validation = useLicenseStore((s) => s.validation);
  const setValidation = useLicenseStore((s) => s.setValidation);
  const hasChecked = useLicenseStore((s) => s.hasChecked);
  const setHasChecked = useLicenseStore((s) => s.setHasChecked);

  const [machineId, setMachineId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!hasChecked);

  useEffect(() => {
    let cancelled = false;

    async function checkLicense() {
      setIsLoading(true);

      // Get machine ID
      const mid = await getMachineId();
      if (cancelled) return;
      setMachineId(mid);

      // Dev bypass
      if (process.env.NODE_ENV === "development" && !env.licensePublicKey) {
        setValidation({
          status: "valid",
          message: "Development mode — license validation bypassed",
        });
        setHasChecked(true);
        setIsLoading(false);
        return;
      }

      // If no license, self-issue trial
      let currentLicense = license;
      if (!currentLicense) {
        currentLicense = await issueTrial(mid);
        if (cancelled) return;
        setLicense(currentLicense);
      }

      // Validate
      const result = await validateLicense(
        currentLicense,
        mid,
        env.appVersion,
      );
      if (cancelled) return;

      setValidation(result);
      // Wave 2: sync the license to the server so requireLicense() works
      if (result.status === "valid" || result.status === "expired") {
        fetch("/api/license/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
          body: JSON.stringify(result),
        }).catch(() => { /* best-effort */ });
      }
      setHasChecked(true);
      setIsLoading(false);
    }

    checkLicense();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shortId = machineId ? shortMachineId(machineId) : null;

  return {
    license,
    validation,
    machineId,
    shortId,
    isLoading,
    hasChecked,
  };
}
