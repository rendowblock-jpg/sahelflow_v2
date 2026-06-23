/**
 * License service — the full validation flow.
 *
 * On every app launch:
 *   1. Read license from storage (localStorage in dev, OS keychain in Tauri)
 *   2. If it's a real (Ed25519-signed) license → verify signature with the
 *      founder's public key, check machine ID, version, expiry
 *   3. If it's a self-issued trial → verify the trial invariants (issuedAt +
 *      7d == expiresAt, not expired, machineId matches) — no signature check
 *      because trials are unsigned by design
 *   4. Return LicenseValidationResult
 *
 * Trial design (post AAA audit fix, S-002):
 *   - Trials are unsigned (`signature: "self-issued-trial"`). The previous
 *     HMAC-SHA256(machineId) scheme was forgeable (machineId is locally
 *     readable) and provided no real tamper-resistance — security theater.
 *   - Instead, we verify the trial invariants on each launch:
 *       a. `expiresAt === issuedAt + 7 days` (no tampering with expiry)
 *       b. `issuedAt` is not in the future (no clock rollback)
 *       c. `machineIds[0] === currentMachineId` (not copied from another machine)
 *       d. `expiresAt > now` (not expired)
 *   - This stops casual tampering. A sophisticated user can still delete
 *     localStorage and re-issue a trial — to prevent that, store a trial
 *     counter in Stronghold (TODO: future hardening).
 *
 * Fail-closed policy (post AAA audit fix, S-002):
 *   - In production, if signature verification throws (corrupted license,
 *     missing public key, crypto failure), return `status: "invalid"` — NOT
 *     "valid" in a grace-mode catch-all. The previous grace-mode behavior
 *     converted every failure into "license valid", which is the opposite
 *     of fail-closed.
 *   - In dev, license checks are bypassed entirely (NODE_ENV=development).
 *
 * Public key requirement:
 *   - In production, `LICENSE_PUBLIC_KEY` MUST be set (embedded at Tauri
 *     build time). If it's missing, we log a loud warning. The app still
 *     runs (so the founder isn't locked out of a misconfigured build) but
 *     every stored license will fail signature verification and the user
 *     will see "License invalid" until they obtain a real key.
 */

import { env } from "@/lib/env";
import type { LicensePayload, LicenseStatus, LicenseValidationResult, SignedLicense } from "./types";
import { verifyLicenseSignature, isExpired, daysRemaining, meetsVersionRequirement } from "./crypto";

// Read NODE_ENV at call time (not module load) so tests can mutate it.
function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

// The app's public key (founder embeds this — only verifies, never signs).
// In production, this comes from env. In dev, it's empty (bypassed).
function getPublicKey(): string {
  return env.licensePublicKey || "";
}

/** Sentinel signature value for self-issued (unsigned) trials. */
const SELF_ISSUED_TRIAL_SIGNATURE = "self-issued-trial";

/** Trial window in days. */
const TRIAL_DURATION_DAYS = 7;

/** Tolerance for clock skew between issuedAt and now (1 hour, in ms). */
const CLOCK_SKEW_TOLERANCE_MS = 60 * 60 * 1000;

/** Tolerance for expiresAt vs issuedAt + TRIAL_DURATION_DAYS (1 second, in ms). */
const EXPIRY_TOLERANCE_MS = 1000;

/**
 * Validate a signed license.
 * Does NOT check storage — just verifies the license itself.
 */
export async function validateLicense(
  license: SignedLicense,
  machineId: string,
  appVersion: string,
): Promise<LicenseValidationResult> {
  // Dev bypass — only when no public key is configured (so dev tests with a
  // real key still exercise the verification path).
  if (isDevMode() && !getPublicKey()) {
    return {
      status: "valid",
      license,
      message: "Development mode — license validation bypassed",
    };
  }

  const payload = license.payload;

  // 1. Self-issued trials: verify invariants instead of a signature.
  if (license.signature === SELF_ISSUED_TRIAL_SIGNATURE) {
    return validateSelfIssuedTrial(license, machineId);
  }

  // 2. Real (Ed25519-signed) licenses: verify the signature.
  //    If the public key is missing, signature verification will throw —
  //    we catch that and return "invalid" (fail-closed).
  const publicKey = getPublicKey();
  if (!publicKey) {
    console.warn(
      "[license] LICENSE_PUBLIC_KEY is not set. Real licenses cannot be verified. " +
        "Set LICENSE_PUBLIC_KEY at build time (see sf-license pubkey).",
    );
    return {
      status: "invalid",
      license,
      message: "License verification unavailable — public key not configured",
    };
  }

  let signatureValid: boolean;
  try {
    signatureValid = await verifyLicenseSignature(license, publicKey);
  } catch (err) {
    // Fail-closed: any crypto error (corrupted signature, wrong key format,
    // etc.) is treated as invalid. Do NOT return "valid" in a catch-all.
    console.error("[license] signature verification threw:", err);
    return {
      status: "invalid",
      license,
      message: "License signature could not be verified",
    };
  }

  if (!signatureValid) {
    return {
      status: "invalid",
      license,
      message: "License signature is invalid — tampered or wrong key",
    };
  }

  // 3. Check machine ID
  if (!payload.machineIds.includes(machineId)) {
    return {
      status: "machine_mismatch",
      license,
      message: `License is tied to a different machine. This machine: ${machineId}`,
    };
  }

  // 4. Check version-gating
  if (!meetsVersionRequirement(payload, appVersion)) {
    return {
      status: "version_blocked",
      license,
      message: `App version ${appVersion} is older than required ${payload.minAppVersion}`,
    };
  }

  // 5. Check expiry
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

/**
 * Verify the invariants of a self-issued trial license.
 *
 * Trials are unsigned by design — we can't verify a signature. Instead, we
 * check that the trial payload hasn't been tampered with:
 *   1. `expiresAt === issuedAt + 7 days` (within 1s tolerance)
 *   2. `issuedAt` is not in the future (within 1h clock-skew tolerance)
 *   3. `machineIds[0] === currentMachineId`
 *   4. `expiresAt > now` (not expired)
 *
 * If any invariant fails, the trial is rejected as "invalid" (the user
 * tampered with it). They can either delete localStorage to get a fresh
 * 7-day trial, or obtain a real license from the founder.
 */
function validateSelfIssuedTrial(
  license: SignedLicense,
  machineId: string,
): LicenseValidationResult {
  const payload = license.payload;
  const now = Date.now();
  const issuedAtMs = new Date(payload.issuedAt).getTime();
  const expiresAtMs = payload.expiresAt ? new Date(payload.expiresAt).getTime() : NaN;
  const expectedExpiryMs = issuedAtMs + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

  // Invariant 1: expiresAt matches issuedAt + 7 days (within 1s tolerance)
  if (!Number.isFinite(expiresAtMs) || Math.abs(expiresAtMs - expectedExpiryMs) > EXPIRY_TOLERANCE_MS) {
    return {
      status: "invalid",
      license,
      message: "Trial expiry has been tampered with — obtain a real license",
    };
  }

  // Invariant 2: issuedAt is not in the future (within 1h tolerance)
  if (issuedAtMs - now > CLOCK_SKEW_TOLERANCE_MS) {
    return {
      status: "invalid",
      license,
      message: "Trial issue date is in the future — clock manipulation detected",
    };
  }

  // Invariant 3: machineId matches
  if (!payload.machineIds.includes(machineId)) {
    return {
      status: "machine_mismatch",
      license,
      message: "Trial is tied to a different machine",
    };
  }

  // Invariant 4: not expired
  if (expiresAtMs <= now) {
    const days = Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000));
    return {
      status: "expired",
      license,
      daysRemaining: days,
      message: `Trial expired ${Math.abs(days)} day(s) ago — obtain a real license`,
    };
  }

  return {
    status: "valid",
    license,
    daysRemaining: daysRemaining(payload),
    message: `Trial active — ${daysRemaining(payload)} day(s) remaining`,
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
 *
 * Trials are UNSIGNED (`signature: "self-issued-trial"`). The previous
 * HMAC-SHA256(machineId) scheme was security theater (machineId is locally
 * readable, so anyone could re-sign a tampered payload). Instead, we verify
 * trial invariants on each launch — see `validateSelfIssuedTrial`.
 *
 * Permanent licenses use the founder's Ed25519 key (issued offline via
 * `sf-license sign`).
 */
export async function issueTrial(machineId: string): Promise<SignedLicense> {
  const now = new Date();
  const expiry = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

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

  return { payload, signature: SELF_ISSUED_TRIAL_SIGNATURE };
}

/**
 * Get the license status label for display.
 */
export function getStatusLabel(status: LicenseStatus): string {
  // Return i18n keys — the UI layer translates these via t(`license.status.${key}`)
  const keys: Record<LicenseStatus, string> = {
    valid: "license.status.valid",
    expired: "license.status.expired",
    invalid: "license.status.invalid",
    machine_mismatch: "license.status.machineMismatch",
    activation_limit: "license.status.activationLimit",
    version_blocked: "license.status.versionBlocked",
    missing: "license.status.missing",
  };
  return keys[status] ?? status;
}
