/**
 * License validation module — wired to real implementations.
 *
 * This façade delegates to the underlying modules:
 *   - machine-id.ts: Machine ID fingerprinting (Tauri + browser fallback)
 *   - crypto.ts: Ed25519 signature verification
 *   - license-client.ts: Pure client-safe validation flow + trial issuance
 *
 * CLIENT-SAFE BARREL (Phase 2 build fix):
 *   This module is intentionally client-safe — it MUST NOT re-export
 *   anything from `./license-server.ts` (which has `import "server-only"`
 *   + a static `@/lib/db` import). Re-exporting server functions here
 *   would pull `db.ts` -> `master-key.ts` -> `server-only` into any client
 *   bundle importing from this barrel, breaking the build (the exact
 *   ship-blocker Phase 2 fixes). Server code imports `requireLicense` /
 *   `hasFeature` / `setCachedLicenseResult` / `FEATURE_KEYS` DIRECTLY from
 *   `@/lib/license/license-server` — not via this barrel.
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
  LicenseValidationResult,
  MachineFingerprint,
  MachineId,
  SignedLicense,
} from "./types";
import { env, isTauriEnv } from "@/lib/env";
import { getMachineId } from "./machine-id";
import { validateLicense, issueTrial } from "./license-client";

const STORAGE_KEY = "sahelflow-license";
const APP_VERSION = env.appVersion;

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
 * Delegates to license-client.ts which handles the payload construction.
 */
export async function issueTrialLicense(
  machineId: MachineId,
): Promise<SignedLicense> {
  return issueTrial(machineId);
}

/**
 * Verify a founder-signed permanent license.
 * Delegates to license-client.ts which handles Ed25519 verification.
 */
export async function verifyLicense(
  license: SignedLicense,
  machineId: MachineId,
  appVersion: string,
): Promise<LicenseValidationResult> {
  return validateLicense(license, machineId, appVersion);
}

/**
 * Read the stored license.
 *
 * T-H2: in Tauri (production), the license is stored in Stronghold (the
 * Tauri secure-storage plugin registered in lib.rs) — not localStorage.
 * Stronghold encrypts at rest with a vault password (here: the machine-ID
 * hash, which is deterministic + machine-bound). In dev (browser), falls
 * back to localStorage. Ed25519 signature verification still prevents
 * forgery; Stronghold just adds defense-in-depth (license not readable/
 * copyable from app data in plaintext).
 */
async function readStoredLicense(machineId?: string): Promise<SignedLicense | null> {
  // Tauri path — use Stronghold
  if (isTauriEnv()) {
    try {
      const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
      const vaultPassword = machineId ?? "sahelflow-vault";
      // Stronghold.load(path, password) — path is the snapshot file location.
      // Use the app data dir; the Tauri stronghold plugin resolves relative
      // paths against the app data dir. We use a fixed filename.
      const stronghold = await Stronghold.load("sahelflow.stronghold", vaultPassword);
      const client = await stronghold.loadClient("license-client");
      const store = await client.getStore();
      const raw = await store.get(STORAGE_KEY);
      if (!raw) return null;
      const text = new TextDecoder().decode(raw);
      return JSON.parse(text) as SignedLicense;
    } catch (err) {
      // Stronghold not available / vault locked — fall through to localStorage
      // so the app still works (fail-open for read, fail-closed is enforced by
      // signature verification on the license itself).
      console.warn("[license] Stronghold read failed, falling back to localStorage:", err);
    }
  }
  // Dev / fallback path — localStorage
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
 * Store a license.
 * T-H2: Stronghold in Tauri, localStorage in dev.
 */
async function storeLicense(license: SignedLicense, machineId?: string): Promise<void> {
  // Tauri path — Stronghold
  if (isTauriEnv()) {
    try {
      const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
      const vaultPassword = machineId ?? "sahelflow-vault";
      const stronghold = await Stronghold.load("sahelflow.stronghold", vaultPassword);
      const client = await stronghold.loadClient("license-client");
      const store = await client.getStore();
      const text = JSON.stringify(license);
      await store.insert(STORAGE_KEY, Array.from(new TextEncoder().encode(text)));
      await stronghold.save();
      return;
    } catch (err) {
      console.warn("[license] Stronghold store failed, falling back to localStorage:", err);
    }
  }
  // Dev / fallback path
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
}

/**
 * Validate the current license on app launch.
 * This is the main entry point called by the app on startup.
 *
 * Flow:
 *   1. Dev mode → bypass (return valid)
 *   2. Get machine ID
 *   3. Read stored license
 *   4. If exists → validate it (signature + machine ID + version + expiry)
 *      - If valid → return valid
 *      - If invalid/expired/mismatch → return that status (do NOT fall through
 *        to auto-trial — the user had a license, it failed, they need to know)
 *   5. If no stored license → issue a 7-day trial, store it, return valid
 *
 * Fail-closed: any UNEXPECTED error (crypto failure, storage corruption)
 * returns `status: "invalid"` with the error message — NOT "valid" in a
 * grace-mode catch-all. The previous grace-mode behavior (pre AAA audit
 * fix, S-002) converted every failure into "license valid", which is the
 * opposite of fail-closed.
 *
 * Expected errors (localStorage empty, JSON parse fail) are handled inline
 * and fall through to the trial-issuance path — those are NOT propagated
 * as "invalid".
 */
export async function validateOnLaunch(): Promise<LicenseValidationResult> {
  // Dev bypass — only when no public key is configured (so dev tests with a
  // real key still exercise the verification path).
  if (env.isDev && !env.licensePublicKey) {
    return {
      status: "valid",
      message: "Development mode — license validation bypassed",
    };
  }

  // Step 1: get the machine ID. If this fails, we can't validate or issue
  // a trial — fail-closed.
  let machineId: string;
  try {
    machineId = await getMachineId();
  } catch (err) {
    console.error("[license] failed to get machine ID:", err);
    return {
      status: "invalid",
      message: "Could not determine machine ID — license validation failed",
    };
  }

  // Step 2: read the stored license. If storage is corrupted/missing, fall
  // through to trial issuance (not an error).
  const stored = await readStoredLicense(machineId);

  if (stored) {
    // Step 3: validate the stored license. Propagate the result — do NOT
    // fall through to trial issuance on failure. The user had a license;
    // if it failed, they need to see the failure (expired, invalid,
    // machine mismatch) so they can take action (renew, re-enter, contact
    // support). Auto-issuing a fresh trial would hide the failure.
    try {
      const result = await validateLicense(stored, machineId, APP_VERSION);
      return result;
    } catch (err) {
      // Unexpected error in validation itself (not a normal "invalid" result
      // — those are returned, not thrown). Fail-closed.
      console.error("[license] validateLicense threw:", err);
      return {
        status: "invalid",
        message: "License validation error — please re-enter your license key",
      };
    }
  }

  // Step 4: no stored license → issue a 7-day trial.
  try {
    const trial = await issueTrial(machineId);
    await storeLicense(trial, machineId);
    return {
      status: "valid",
      license: trial,
      daysRemaining: 7,
      message: "Trial active — 7 day(s) remaining",
    };
  } catch (err) {
    console.error("[license] failed to issue trial:", err);
    return {
      status: "invalid",
      message: "Could not issue a trial license — please enter a license key",
    };
  }
}

export type { LicensePayload, SignedLicense, LicenseValidationResult, MachineFingerprint, MachineId } from "./types";
