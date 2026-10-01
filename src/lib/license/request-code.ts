import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Licence request code: everything a Founder needs to sign a permanent
 * entitlement that exactly this installation will accept, in one string a
 * seller can paste into WhatsApp after paying.
 *
 * It carries identifiers the seller already sends to SahelFlow's trial
 * service (workspace, installation, derived device binding) plus the epochs
 * activation enforces. It is not a credential: only the Founder's offline key
 * can turn it into a licence, and activation re-checks every claim.
 *
 *   SFLR1.<base64url JSON>.<8-hex checksum>
 */
export const LICENSE_REQUEST_PREFIX = "SFLR1";

const licenseRequestSchema = z
  .object({
    workspaceId: z.string().regex(/^[0-9a-f]{32}$/i),
    installationId: z.string().regex(/^[0-9a-f]{32}$/i),
    deviceBinding: z.string().regex(/^sfdb1_[0-9a-f]{64}$/),
    productMajor: z.number().int().positive().max(1_000),
    transferEpoch: z.number().int().nonnegative().safe(),
    revocationEpoch: z.number().int().nonnegative().safe(),
    recoveryEpoch: z.number().int().nonnegative().safe(),
    currentLicenseId: z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/).nullable(),
  })
  .strict();

export type LicenseRequest = z.infer<typeof licenseRequestSchema>;

function checksum(payload: string): string {
  return createHash("sha256").update(`${LICENSE_REQUEST_PREFIX}:${payload}`).digest("hex").slice(0, 8);
}

export function encodeLicenseRequest(request: LicenseRequest): string {
  const valid = licenseRequestSchema.parse(request);
  const payload = Buffer.from(JSON.stringify(valid), "utf8").toString("base64url");
  return `${LICENSE_REQUEST_PREFIX}.${payload}.${checksum(payload)}`;
}

export function decodeLicenseRequest(code: string): LicenseRequest {
  const parts = code.replace(/\s+/g, "").split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_REQUEST_PREFIX) {
    throw new Error("Not a SahelFlow licence request code");
  }
  const [, payload, sum] = parts as [string, string, string];
  if (checksum(payload) !== sum.toLowerCase()) {
    throw new Error("Licence request code is incomplete or mistyped (checksum mismatch)");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Licence request code payload is unreadable");
  }
  return licenseRequestSchema.parse(parsed);
}
