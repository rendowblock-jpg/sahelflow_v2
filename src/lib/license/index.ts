/**
 * License validation module — skeleton/stubs.
 *
 * Real implementation comes in Phase 0 item #4 (2 weeks):
 *   - Ed25519 signing/verification (using @noble/ed25519 or node:crypto)
 *   - Machine-ID fingerprinting (5 signals: CPU, mobo, disk, MAC, OS GUID)
 *   - OS keychain storage (Windows Credential Manager, macOS Keychain, Linux Secret Service)
 *   - Anti-tamper + obfuscation
 *   - 2-machine activation logic
 *   - Version-gating
 *   - Trial extension flow
 *
 * For now, the app runs in "development mode" (no license check).
 * The skeleton ensures the types are in place so downstream code can be
 * written against the correct interfaces.
 */

import type {
  LicensePayload,
  LicenseValidationResult,
  MachineFingerprint,
  MachineId,
  SignedLicense,
} from "./types";

/**
 * Compute a machine ID from hardware fingerprints.
 * STUB — real implementation uses Tauri's system-info API + SHA-256.
 */
export async function computeMachineId(
  _fingerprint: MachineFingerprint,
): Promise<MachineId> {
  throw new Error("computeMachineId: not implemented (Phase 0 item #4)");
}

/**
 * Get the current machine's fingerprint.
 * STUB — real implementation queries hardware via Tauri sidecar.
 */
export async function getMachineFingerprint(): Promise<MachineFingerprint> {
  throw new Error("getMachineFingerprint: not implemented (Phase 0 item #4)");
}

/**
 * Self-issue a trial license (7 days, machine-ID-tied).
 * STUB — real implementation signs with an app-embedded key.
 */
export async function issueTrialLicense(
  _machineId: MachineId,
): Promise<SignedLicense> {
  throw new Error("issueTrialLicense: not implemented (Phase 0 item #4)");
}

/**
 * Verify a founder-signed permanent license.
 * STUB — real implementation verifies Ed25519 signature with founder's public key.
 */
export async function verifyLicense(
  _license: SignedLicense,
  _machineId: MachineId,
  _appVersion: string,
): Promise<LicenseValidationResult> {
  throw new Error("verifyLicense: not implemented (Phase 0 item #4)");
}

/**
 * Validate the current license on app launch.
 * This is the entry point called by the app on startup.
 *
 * STUB — returns "valid" in development mode.
 * In production, this reads the license from OS keychain and verifies it.
 */
export async function validateOnLaunch(): Promise<LicenseValidationResult> {
  if (process.env.NODE_ENV === "development") {
    return {
      status: "valid",
      message: "Development mode — license validation bypassed",
    };
  }
  throw new Error("validateOnLaunch: not implemented for production (Phase 0 item #4)");
}

/**
 * Generate the founder's keypair (one-time, offline).
 * STUB — real implementation generates Ed25519 keypair.
 * The private key NEVER enters the app bundle. Only the public key is embedded.
 */
export async function generateFounderKeypair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  throw new Error("generateFounderKeypair: not implemented (Phase 0 item #4)");
}

/**
 * Sign a license payload with the founder's private key.
 * STUB — used by the founder's offline license-issuance tool, NOT by the app.
 */
export async function signLicense(
  _payload: LicensePayload,
  _privateKey: string,
): Promise<SignedLicense> {
  throw new Error("signLicense: not implemented (Phase 0 item #4)");
}

export type { LicensePayload, SignedLicense, LicenseValidationResult, MachineFingerprint, MachineId } from "./types";
