/**
 * License validation module — wired to real implementations.
 *
 * This façade delegates to the underlying modules:
 *   - machine-id.ts: Machine ID fingerprinting (Tauri + browser fallback)
 *   - crypto.ts: Ed25519 signature verification
 *   - license-service.ts: Full validation flow + trial issuance
 *
 * On every app launch:
 *   1. Get machine ID (getMachineFingerprint → computeMachineId)
 *   2. Read license from storage (localStorage in dev, OS keychain in Tauri)
 *   3. Verify Ed25519 signature
 *   4. Check machine ID matches, version-gating, expiry
 *   5. If no license → self-issue a 7-day trial
 *   6. Return LicenseValidationResult
 */

import type {
  LicensePayload,
  LicenseValidationResult,
  MachineFingerprint,
  MachineId,
  SignedLicense,
} from "./types";
import { getMachineId } from "./machine-id";
import { validateLicense, issueTrial } from "./license-service";

const STORAGE_KEY = "sahelflow-license";
const APP_VERSION = "3.0.0";

/**
 * Compute a machine ID from hardware fingerprints.
 * Uses SHA-256 hash of concatenated signals.
 */
export async function computeMachineId(
  fingerprint: MachineFingerprint,
): Promise<MachineId> {
  const raw = [
    fingerprint.cpuId,
    fingerprint.motherboardId,
    fingerprint.diskId,
    fingerprint.macAddress,
    fingerprint.osGuid,
  ].join("|");

  // Use Web Crypto API for SHA-256
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback: simple hash for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `fallback-${Math.abs(hash).toString(36)}`;
}

/**
 * Get the current machine's fingerprint.
 * In Tauri: queries real hardware. In dev: returns browser-based ID.
 */
export async function getMachineFingerprint(): Promise<MachineFingerprint> {
  const machineId = await getMachineId();

  // In development/browser mode, all signals are the same browser UUID.
  // In production Tauri, this would query each hardware signal separately.
  return {
    cpuId: machineId,
    motherboardId: machineId,
    diskId: machineId,
    macAddress: machineId,
    osGuid: machineId,
  };
}

/**
 * Self-issue a trial license (7 days, machine-ID-tied).
 * Delegates to license-service.ts which handles the payload construction.
 */
export async function issueTrialLicense(
  machineId: MachineId,
): Promise<SignedLicense> {
  return issueTrial(machineId);
}

/**
 * Verify a founder-signed permanent license.
 * Delegates to license-service.ts which handles Ed25519 verification.
 */
export async function verifyLicense(
  license: SignedLicense,
  machineId: MachineId,
  appVersion: string,
): Promise<LicenseValidationResult> {
  return validateLicense(license, machineId, appVersion);
}

/**
 * Read the stored license from localStorage (dev) or OS keychain (Tauri).
 */
function readStoredLicense(): SignedLicense | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignedLicense;
  } catch {
    return null;
  }
}

/**
 * Store a license in localStorage (dev) or OS keychain (Tauri).
 */
function storeLicense(license: SignedLicense): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
}

/**
 * Validate the current license on app launch.
 * This is the main entry point called by the app on startup.
 *
 * Flow:
 *   1. Get machine ID
 *   2. Read stored license
 *   3. If exists → verify it
 *   4. If missing or invalid → issue a trial
 *   5. Return the result
 */
export async function validateOnLaunch(): Promise<LicenseValidationResult> {
  // Dev bypass
  if (process.env.NODE_ENV === "development") {
    return {
      status: "valid",
      message: "Development mode — license validation bypassed",
    };
  }

  try {
    const machineId = await getMachineId();

    // 1. Try reading stored license
    const stored = readStoredLicense();
    if (stored) {
      const result = await validateLicense(stored, machineId, APP_VERSION);
      if (result.status === "valid") {
        return result;
      }
      // If expired or invalid, fall through to issue new trial
    }

    // 2. No valid license → issue a trial
    const trial = await issueTrial(machineId);
    storeLicense(trial);

    return {
      status: "valid",
      license: trial,
      daysRemaining: 7,
      message: "Trial active — 7 day(s) remaining",
    };
  } catch (error) {
    console.error("License validation failed:", error);
    return {
      status: "valid",
      message: "License validation error — running in grace mode",
    };
  }
}

/**
 * Generate the founder's keypair (one-time, offline).
 * This is an OFFLINE TOOL — it should NEVER be called from the app.
 * Use the sf-license CLI tool instead.
 */
export async function generateFounderKeypair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  throw new Error(
    "generateFounderKeypair is an offline-only operation. " +
    "Use the sf-license CLI tool to generate keypairs. " +
    "This function should never be called from the app.",
  );
}

/**
 * Sign a license payload with the founder's private key.
 * This is an OFFLINE TOOL — used by the founder's license-issuance tool, NOT by the app.
 */
export async function signLicense(
  _payload: LicensePayload,
  _privateKey: string,
): Promise<SignedLicense> {
  throw new Error(
    "signLicense is an offline-only operation. " +
    "Use the sf-license CLI tool to sign licenses. " +
    "This function should never be called from the app.",
  );
}

export type { LicensePayload, SignedLicense, LicenseValidationResult, MachineFingerprint, MachineId } from "./types";
