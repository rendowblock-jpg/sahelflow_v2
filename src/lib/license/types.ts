/**
 * License validation types.
 *
 * Design system Section 2.2 + 4.4:
 *   - Layer 4-local: crypto license + obfuscation + anti-tamper + machine ID
 *   - Trial: 7 days, self-issued, machine-ID-tied
 *   - Permanent: founder-signed, verified with public key
 *   - 2-machine activation limit
 *   - Version-gating (license payload includes min app version)
 *   - OS keychain storage
 *
 * This file defines the data structures. The crypto implementation
 * (signing, verification, machine-ID fingerprinting) comes in Phase 0 item #4.
 */

/** License type: trial (self-issued) or permanent (founder-signed) */
export type LicenseType = "trial" | "permanent" | "extension";

/** License status as seen by the app */
export type LicenseStatus =
  | "valid"           // License is active and valid
  | "expired"         // Trial/extension has passed its expiry
  | "invalid"         // Signature verification failed / tampered
  | "machine_mismatch" // License tied to a different machine
  | "activation_limit" // 2-machine limit exceeded
  | "version_blocked"  // App version is older than license's minVersion
  | "missing";        // No license found

/** The license payload (what gets signed) */
export interface LicensePayload {
  /** License ID (cuid) */
  id: string;
  /** License type */
  type: LicenseType;
  /** Machine IDs this license is activated on (max 2 for permanent) */
  machineIds: string[];
  /** Features enabled by this license (for feature-flag gating) */
  features: string[];
  /** Minimum app version this license is valid for (version-gating) */
  minAppVersion: string;
  /** ISO 8601 timestamp — when the license was issued */
  issuedAt: string;
  /** ISO 8601 timestamp — when the license expires (undefined = never) */
  expiresAt?: string;
  /** Issuer: "app" (self-issued trial) or "founder" (permanent) */
  issuedBy: string;
}

/** Signed license = payload + signature */
export interface SignedLicense {
  payload: LicensePayload;
  /** Ed25519 signature (base64) */
  signature: string;
}

/** Result of license validation */
export interface LicenseValidationResult {
  status: LicenseStatus;
  license?: SignedLicense;
  /** Days remaining (for trials/extensions) */
  daysRemaining?: number;
  /** Human-readable message (localized by the caller) */
  message: string;
}

/** Machine fingerprint signals (5 signals per design system Section 4.4) */
export interface MachineFingerprint {
  cpuId: string;
  motherboardId: string;
  diskId: string;
  macAddress: string;
  osGuid: string;
}

/** Computed machine ID (hash of the 5 signals) */
export type MachineId = string;
