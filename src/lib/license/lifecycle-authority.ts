import "server-only";

import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { getMasterKey } from "@/lib/crypto/master-key";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  licenseAuthorityPath,
  requireLicenseEntitlement,
} from "./license-authority";
import { signedEntitlementSchema } from "./entitlement";

const AUTHORITY_FORMAT = 1 as const;
const AUTHORITY_KEY_ID = "installation-root-license-hmac-v1" as const;
const isoDate = z.string().datetime({ offset: true });

const lifecycleAuthorityStateSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT),
    revision: z.number().int().positive().safe(),
    entitlement: signedEntitlementSchema,
    activatedAt: isoDate,
    lastObservedAt: isoDate,
    minimumRevocationEpoch: z.number().int().nonnegative().safe(),
  })
  .strict();

const lifecycleAuthorityEnvelopeSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT),
    keyId: z.literal(AUTHORITY_KEY_ID),
    state: lifecycleAuthorityStateSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

type LifecycleAuthorityState = z.infer<typeof lifecycleAuthorityStateSchema>;

export type LifecycleEntitlementAuthority = Readonly<{
  entitlementId: string;
  entitlementRevision: number;
  shopSlots: number;
}>;

function authorityError(message: string, code = "LICENSE_AUTHORITY_UNAVAILABLE") {
  return new SahelFlowError(message, code, 503);
}

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw authorityError("License lifecycle authority contains unsupported canonical data");
}

function stateMac(state: LifecycleAuthorityState): Buffer {
  const root = getMasterKey();
  if (root.length !== 32) {
    throw authorityError("Installation root is not 256-bit");
  }
  const derived = createHmac("sha256", root)
    .update("sahelflow.license-authority.key.v1", "utf8")
    .digest();
  try {
    return createHmac("sha256", derived)
      .update("authority\0", "utf8")
      .update(JSON.stringify(canonicalize(state)), "utf8")
      .digest();
  } finally {
    derived.fill(0);
  }
}

function readLifecycleAuthority(): z.infer<typeof lifecycleAuthorityEnvelopeSchema> {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(licenseAuthorityPath(), "utf8"));
  } catch {
    throw authorityError("Signed license authority is unavailable for shop lifecycle");
  }
  const parsed = lifecycleAuthorityEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw authorityError("Signed license authority has an invalid lifecycle format");
  }
  const expected = stateMac(parsed.data.state);
  const supplied = Buffer.from(parsed.data.mac, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw authorityError("Signed license lifecycle authority authentication failed");
  }
  return parsed.data;
}

export async function requireLifecycleEntitlementAuthority(
  shop: ShopContext,
): Promise<LifecycleEntitlementAuthority> {
  const projection = await requireLicenseEntitlement(undefined, shop);

  if (
    process.env.NODE_ENV === "development" &&
    process.env.SF_LICENSE_DEVELOPMENT_BYPASS !== "false" &&
    projection.licenseId === null
  ) {
    return Object.freeze({
      entitlementId: "development-bypass",
      entitlementRevision: 1,
      shopSlots: projection.shopSlots,
    });
  }

  const envelope = readLifecycleAuthority();
  const claims = envelope.state.entitlement.claims;
  if (
    projection.licenseId === null ||
    projection.licenseId !== claims.licenseId ||
    projection.shopSlots !== claims.shopSlots
  ) {
    throw authorityError(
      "Validated license projection does not match signed lifecycle authority",
      "LICENSE_LIFECYCLE_AUTHORITY_MISMATCH",
    );
  }

  return Object.freeze({
    entitlementId: claims.licenseId,
    entitlementRevision: envelope.state.revision,
    shopSlots: claims.shopSlots,
  });
}
