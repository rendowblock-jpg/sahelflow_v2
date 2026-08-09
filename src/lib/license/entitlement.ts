import { createPublicKey, verify as verifySignature } from "node:crypto";
import { z } from "zod";
import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "./entitlement-canonical";

export {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "./entitlement-canonical";
export const LICENSE_CLOCK_SKEW_MS = 5 * 60 * 1000;

const ED25519_RAW_PUBLIC_KEY_BYTES = 32;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const exactAuthorityId = z.string().regex(/^[0-9a-f]{32}$/i);
const opaqueId = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/);
const deviceBinding = z.string().regex(/^sfdb1_[0-9a-f]{64}$/);
const isoDate = z.string().datetime({ offset: true });
const featureName = z.string().regex(/^[a-z][a-z0-9._-]{1,63}$/);

export const entitlementClaimsSchema = z
  .object({
    domain: z.literal(LICENSE_ENTITLEMENT_DOMAIN),
    formatVersion: z.literal(LICENSE_ENTITLEMENT_FORMAT),
    licenseId: opaqueId,
    workspaceId: exactAuthorityId,
    installationId: exactAuthorityId,
    deviceBinding,
    productMajor: z.number().int().positive().max(1_000),
    type: z.enum(["trial", "extension", "permanent"]),
    issuedAt: isoDate,
    expiresAt: isoDate.nullable(),
    supportEndsAt: isoDate,
    shopSlots: z.number().int().positive().max(1_000),
    memberLimit: z.number().int().positive().max(25),
    deviceLimit: z.number().int().positive().max(25),
    backupBytes: z.number().int().nonnegative().safe(),
    mediaBytes: z.number().int().nonnegative().safe(),
    features: z
      .array(featureName)
      .min(1)
      .max(128)
      .refine((values) => new Set(values).size === values.length, "features must be unique"),
    transferState: z.enum(["active", "pending", "revoked"]),
    transferEpoch: z.number().int().nonnegative().safe(),
    recoveryEpoch: z.number().int().nonnegative().safe(),
    revocationEpoch: z.number().int().nonnegative().safe(),
    keyId: opaqueId,
    issuer: z.enum(["trial-service", "founder-offline"]),
  })
  .strict()
  .superRefine((claims, context) => {
    if (claims.type === "permanent" && claims.expiresAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "permanent entitlement cannot expire",
      });
    }
    if (claims.type !== "permanent" && claims.expiresAt === null) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "trial and extension entitlements require expiry",
      });
    }
    if (claims.type === "permanent" && claims.issuer !== "founder-offline") {
      context.addIssue({
        code: "custom",
        path: ["issuer"],
        message: "permanent entitlement requires the offline founder authority",
      });
    }
    if (claims.type !== "permanent" && claims.issuer !== "trial-service") {
      context.addIssue({
        code: "custom",
        path: ["issuer"],
        message: "trial and extension entitlements require the trial service authority",
      });
    }
  });

export const signedEntitlementSchema = z
  .object({
    claims: entitlementClaimsSchema,
    signature: z.string().min(40).max(256),
  })
  .strict();

export type EntitlementClaims = z.infer<typeof entitlementClaimsSchema>;
export type SignedEntitlement = z.infer<typeof signedEntitlementSchema>;

export type LicenseVerificationKeyring = Readonly<{
  trial: Readonly<Record<string, string>>;
  permanent: Readonly<Record<string, string>>;
}>;

export type EntitlementValidationStatus =
  | "valid"
  | "invalid"
  | "expired"
  | "clock_rollback"
  | "device_mismatch"
  | "installation_mismatch"
  | "workspace_mismatch"
  | "product_mismatch"
  | "revoked"
  | "transfer_required";

export type EntitlementValidationContext = Readonly<{
  workspaceId: string;
  installationId: string;
  deviceBinding: string;
  appVersion: string;
  minimumRevocationEpoch: number;
  lastObservedAt?: string | null;
  now?: Date;
}>;

export type EntitlementValidationResult = Readonly<{
  status: EntitlementValidationStatus;
  entitlement?: SignedEntitlement;
  message: string;
}>;

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function verifyEd25519Signature(signature: string, message: Uint8Array, publicKey: string): boolean {
  const rawPublicKey = decodeBase64(publicKey);
  if (rawPublicKey.length !== ED25519_RAW_PUBLIC_KEY_BYTES) {
    throw new Error("Entitlement Ed25519 public key must be exactly 32 bytes");
  }
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
    format: "der",
    type: "spki",
  });
  return verifySignature(null, Buffer.from(message), key, decodeBase64(signature));
}

function appMajor(version: string): number | null {
  const match = /^(\d+)\./.exec(version);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function invalid(message: string): EntitlementValidationResult {
  return { status: "invalid", message };
}

export async function validateSignedEntitlement(
  input: unknown,
  context: EntitlementValidationContext,
  keyring: LicenseVerificationKeyring,
): Promise<EntitlementValidationResult> {
  const parsed = signedEntitlementSchema.safeParse(input);
  if (!parsed.success) return invalid("Entitlement format is invalid");
  const entitlement = parsed.data;
  const { claims } = entitlement;
  const authorityKeys = claims.issuer === "founder-offline" ? keyring.permanent : keyring.trial;
  const publicKey = authorityKeys[claims.keyId];
  if (!publicKey) return invalid("Entitlement signing key is unavailable");

  let signatureValid = false;
  try {
    signatureValid = verifyEd25519Signature(
      entitlement.signature,
      canonicalEntitlementBytes(claims),
      publicKey,
    );
  } catch {
    return invalid("Entitlement signature could not be verified");
  }
  if (!signatureValid) return invalid("Entitlement signature is invalid");

  if (claims.workspaceId !== context.workspaceId) {
    return { status: "workspace_mismatch", entitlement, message: "Entitlement belongs to another workspace" };
  }
  if (claims.installationId !== context.installationId) {
    return { status: "installation_mismatch", entitlement, message: "Entitlement belongs to another installation" };
  }
  if (claims.deviceBinding !== context.deviceBinding) {
    return { status: "device_mismatch", entitlement, message: "Entitlement belongs to another device" };
  }
  if (claims.productMajor !== appMajor(context.appVersion)) {
    return { status: "product_mismatch", entitlement, message: "Entitlement does not cover this product major" };
  }
  if (claims.revocationEpoch < context.minimumRevocationEpoch || claims.transferState === "revoked") {
    return { status: "revoked", entitlement, message: "Entitlement has been revoked" };
  }
  if (claims.transferState === "pending") {
    return { status: "transfer_required", entitlement, message: "Entitlement transfer must be completed" };
  }

  const now = (context.now ?? new Date()).getTime();
  const issuedAt = new Date(claims.issuedAt).getTime();
  const lastObservedAt = context.lastObservedAt
    ? new Date(context.lastObservedAt).getTime()
    : null;
  if (issuedAt - now > LICENSE_CLOCK_SKEW_MS) {
    return { status: "clock_rollback", entitlement, message: "System clock precedes entitlement issuance" };
  }
  if (lastObservedAt !== null && Number.isFinite(lastObservedAt) && lastObservedAt - now > LICENSE_CLOCK_SKEW_MS) {
    return { status: "clock_rollback", entitlement, message: "System clock moved behind protected license time" };
  }
  if (claims.expiresAt && new Date(claims.expiresAt).getTime() <= now) {
    return { status: "expired", entitlement, message: "Entitlement has expired" };
  }

  return { status: "valid", entitlement, message: "Entitlement is valid" };
}
