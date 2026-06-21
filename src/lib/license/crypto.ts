/**
 * License cryptographic functions — Ed25519 sign/verify.
 *
 * Uses @noble/ed25519 (audited, same lib as sf-license tool).
 * The app only VERIFIES (never signs). Signing is done offline
 * by the founder using the sf-license tool.
 */
import { verifyAsync } from "@noble/ed25519";
import type { LicensePayload, SignedLicense } from "./types";

function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

/**
 * Verify a signed license's Ed25519 signature.
 */
export async function verifyLicenseSignature(
  license: SignedLicense,
  publicKeyBase64: string,
): Promise<boolean> {
  if (!publicKeyBase64) {
    throw new Error("No public key configured (LICENSE_PUBLIC_KEY)");
  }
  const publicKey = fromBase64(publicKeyBase64);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(license.payload));
  const signature = fromBase64(license.signature);
  return verifyAsync(signature, payloadBytes, publicKey);
}

/** Check if a license payload is expired. */
export function isExpired(payload: LicensePayload, now: Date = new Date()): boolean {
  if (!payload.expiresAt) return false;
  return new Date(payload.expiresAt) < now;
}

/** Calculate days remaining until expiry (Infinity for permanent). */
export function daysRemaining(payload: LicensePayload, now: Date = new Date()): number {
  if (!payload.expiresAt) return Infinity;
  const ms = new Date(payload.expiresAt).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Parse a semver string into a tuple [major, minor, patch]. */
function parseSemver(v: string): [number, number, number] {
  const parts = v.split(".").map((n) => parseInt(n, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Check if the app version meets the license's minimum version requirement.
 */
export function meetsVersionRequirement(
  payload: LicensePayload,
  appVersion: string,
): boolean {
  const [minMajor, minMinor, minPatch] = parseSemver(payload.minAppVersion);
  const [appMajor, appMinor, appPatch] = parseSemver(appVersion);

  if (appMajor !== minMajor) return appMajor > minMajor;
  if (appMinor !== minMinor) return appMinor > minMinor;
  return appPatch >= minPatch;
}
