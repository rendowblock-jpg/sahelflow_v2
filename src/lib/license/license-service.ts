/**
 * License service — the full validation flow.
 *
 * On every app launch:
 *   1. Read license from storage (localStorage in dev, OS keychain in Tauri)
 *   2. Verify Ed25519 signature with founder's public key
 *   3. Check machine ID matches
 *   4. Check version-gating (app version >= minAppVersion)
 *   5. Check expiry (for trials/extensions)
 *   6. Return LicenseValidationResult
 *
 * If no license exists:
 *   - Self-issue a 7-day trial (machine-ID-tied)
 *   - Store it
 *   - Return "valid" (trial active)
 */

import { env } from "@/lib/env";
import type { LicensePayload, LicenseStatus, LicenseValidationResult, SignedLicense } from "./types";
import { verifyLicenseSignature, isExpired, daysRemaining, meetsVersionRequirement } from "./crypto";

// In dev mode, bypass license checks
const isDev = process.env.NODE_ENV === "development";

// The app's public key (founder embeds this — only verifies, never signs)
// In production, this comes from env. In dev, it's empty (bypassed).
const PUBLIC_KEY = env.licensePublicKey || "";

/**
 * Validate a signed license.
 * Does NOT check storage — just verifies the license itself.
 */
export async function validateLicense(
  license: SignedLicense,
  machineId: string,
  appVersion: string,
): Promise<LicenseValidationResult> {
  // Dev bypass
  if (isDev && !PUBLIC_KEY) {
    return {
      status: "valid",
      license,
      message: "Development mode — license validation bypassed",
    };
  }

  // 1. Verify signature
  const signatureValid = await verifyLicenseSignature(license, PUBLIC_KEY);
  if (!signatureValid) {
    return {
      status: "invalid",
      license,
      message: "License signature is invalid — tampered or wrong key",
    };
  }

  const payload = license.payload;

  // 2. Check machine ID
  if (!payload.machineIds.includes(machineId)) {
    return {
      status: "machine_mismatch",
      license,
      message: `License is tied to a different machine. This machine: ${machineId}`,
    };
  }

  // 3. Check version-gating
  if (!meetsVersionRequirement(payload, appVersion)) {
    return {
      status: "version_blocked",
      license,
      message: `App version ${appVersion} is older than required ${payload.minAppVersion}`,
    };
  }

  // 4. Check expiry
  if (isExpired(payload)) {
    const days = daysRemaining(payload);
    return {
      status: "expired",
      license,
      daysRemaining: days,
      message: `License expired ${Math.abs(days)} day(s) ago`,
    };
  }

  // All checks passed
  return {
    status: "valid",
    license,
    daysRemaining: daysRemaining(payload),
    message: getStatusMessage(payload),
  };
}

function getStatusMessage(payload: LicensePayload): string {
  if (payload.type === "permanent") {
    return "Permanent license — active";
  }
  if (payload.type === "trial") {
    const days = daysRemaining(payload);
    return `Trial active — ${days} day(s) remaining`;
  }
  if (payload.type === "extension") {
    const days = daysRemaining(payload);
    return `Extension active — ${days} day(s) remaining`;
  }
  return "License active";
}

/**
 * Self-issue a 7-day trial license.
 * In production, this signs with an app-embedded key.
 * In dev, it just creates an unsigned stub.
 */
export async function issueTrial(machineId: string): Promise<SignedLicense> {
  const now = new Date();
  const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const payload: LicensePayload = {
    id: `trial_${Date.now()}`,
    type: "trial",
    machineIds: [machineId],
    features: ["all"],
    minAppVersion: "3.0.0",
    issuedAt: now.toISOString(),
    expiresAt: expiry.toISOString(),
    issuedBy: "app",
  };

  // In production, sign this with an app-embedded signing key
  // (different from the founder's key — the app can issue trials but not permanent licenses)
  // For now, use a placeholder signature
  const signature = isDev ? "dev-trial-signature" : "TODO: app-signing-key";

  return { payload, signature };
}

/**
 * Get the license status label for display.
 */
export function getStatusLabel(status: LicenseStatus): string {
  const labels: Record<LicenseStatus, string> = {
    valid: "Active",
    expired: "Expirée",
    invalid: "Invalide",
    machine_mismatch: "Machine incorrecte",
    activation_limit: "Limite d'activation",
    version_blocked: "Version bloquée",
    missing: "Aucune licence",
  };
  return labels[status] ?? status;
}
