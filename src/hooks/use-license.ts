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
      // Wave 2: sync the SIGNED LICENSE BLOB to the server so requireLicense()
      // can re-verify server-side. The server route expects
      // {license: {payload, signature}, clientStatus} — NOT the full
      // LicenseValidationResult. The server re-verifies the signature itself
      // and ignores clientStatus (kept for informational purposes only).
      // (CONN-4-BUILD finding: previously posted {status, daysRemaining, message}
      // which the route's zod schema rejected with 400.)
      if ((result.status === "valid" || result.status === "expired") && currentLicense) {
        fetch("/api/license/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
          body: JSON.stringify({
            license: currentLicense,
            clientStatus: result.status,
            // Session 29 fix (AUDIT-3 S1): send the client machineId so the
            // server can re-verify the license against the correct machine.
            // Safe because the license signature covers payload.machineIds.
            machineId: mid,
          }),
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
