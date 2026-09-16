import "server-only";

/**
 * Storefront checkout gates — configuration + enforcement seam
 * (FD-061 EX-4, slice 6).
 *
 * Contracts extracted from CodFlow (github.com/bighadj22/codflow @
 * 00f18fa, Apache-2.0) and re-scoped onto the desktop storefront:
 *   - per-storefront configuration row (missing/disabled → the gates are
 *     inert — zero behavior change);
 *   - the dzverify API key and the Turnstile widget secret ride the shop's
 *     ENCRYPTED Secret authority under per-storefront keys — never the
 *     config row, never a response body (write-only from the dashboard);
 *   - the buyer-facing projection exposes only booleans and the PUBLIC
 *     Turnstile site key.
 */

import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";
import { deleteSecret, getSecret, hasSecret, setSecret } from "@/lib/secrets";
import { SahelFlowError } from "@/types/errors";

export const DZVERIFY_API_KEY_SECRET_PREFIX = "storefront_gates:dzverify:";
export const TURNSTILE_SECRET_KEY_PREFIX = "storefront_gates:turnstile:";

export function dzverifySecretKey(storefrontSlug: string): string {
  return `${DZVERIFY_API_KEY_SECRET_PREFIX}${storefrontSlug}`;
}

export function turnstileSecretKey(storefrontSlug: string): string {
  return `${TURNSTILE_SECRET_KEY_PREFIX}${storefrontSlug}`;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const gatesConfigSchema = z.object({
  storefrontSlug: z.string().trim().min(1).max(120),
  otpEnabled: z.boolean(),
  otpLanguage: z.enum(["en", "fr", "ar"]).default("ar"),
  turnstileEnabled: z.boolean(),
  /**
   * Write-only secrets. Empty/undefined keeps the stored value; the
   * literal "-" clears it. The plain value is never echoed back.
   */
  dzverifyApiKey: z.string().max(200).optional(),
  turnstileSecretKey: z.string().max(200).optional(),
  turnstileSiteKey: z.string().trim().max(200).nullable().optional(),
});

export type GatesConfigInput = z.infer<typeof gatesConfigSchema>;

export interface StorefrontGatesConfig {
  storefrontSlug: string;
  otpEnabled: boolean;
  otpLanguage: string;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  hasDzverifyApiKey: boolean;
  hasTurnstileSecretKey: boolean;
}

/** The buyer-facing projection — booleans and the public site key only. */
export interface PublicStorefrontGates {
  otpEnabled: boolean;
  otpLanguage: string;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
}

// ─── Config CRUD ──────────────────────────────────────────────────────────────

export async function getStorefrontGatesConfig(
  context: ServiceContext,
  storefrontSlug: string,
): Promise<StorefrontGatesConfig | null> {
  const row = await context.prisma.storefrontGateConfig.findUnique({
    where: { storefrontSlug },
  });
  if (!row) return null;
  const [hasDzverifyApiKey, hasTurnstileSecretKey] = await Promise.all([
    hasSecret(context, dzverifySecretKey(storefrontSlug)),
    hasSecret(context, turnstileSecretKey(storefrontSlug)),
  ]);
  return {
    storefrontSlug: row.storefrontSlug,
    otpEnabled: row.otpEnabled,
    otpLanguage: row.otpLanguage,
    turnstileEnabled: row.turnstileEnabled,
    turnstileSiteKey: row.turnstileSiteKey,
    hasDzverifyApiKey,
    hasTurnstileSecretKey,
  };
}

/** Resolve + enable the row in one step (upsert authority). */
async function requireConfigRow(context: ServiceContext, storefrontSlug: string) {
  try {
    return await context.prisma.storefrontGateConfig.upsert({
      where: { storefrontSlug },
      create: { storefrontSlug },
      update: {},
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { code?: string }).code === "P2002"
    ) {
      // Racing upserts converge on the same unique row.
      const row = await context.prisma.storefrontGateConfig.findUnique({
        where: { storefrontSlug },
      });
      if (row) return row;
    }
    throw error;
  }
}

/**
 * Save gate configuration. Secret semantics: an empty string KEEPS the
 * stored secret, the literal "-" CLEARS it, a value REPLACES it. Enabling
 * a gate without its secret is rejected fail-closed at save time (the
 * seller cannot arm a gate that could not verify).
 */
export async function saveStorefrontGatesConfig(
  context: ServiceContext,
  input: GatesConfigInput,
): Promise<StorefrontGatesConfig> {
  const row = await requireConfigRow(context, input.storefrontSlug);
  const slug = input.storefrontSlug;

  const applySecret = async (
    raw: string | undefined,
    key: string,
  ): Promise<"kept" | "cleared" | "replaced"> => {
    if (raw === undefined || raw === "") return "kept";
    if (raw === "-") {
      await deleteSecret(context, key);
      return "cleared";
    }
    await setSecret(context, key, raw);
    return "replaced";
  };

  const dzverifyOutcome = await applySecret(
    input.dzverifyApiKey,
    dzverifySecretKey(slug),
  );
  const turnstileOutcome = await applySecret(
    input.turnstileSecretKey,
    turnstileSecretKey(slug),
  );

  const nextOtpEnabled = input.otpEnabled;
  const nextTurnstileEnabled = input.turnstileEnabled;
  const [otpHasSecret, turnstileHasSecret] = await Promise.all([
    hasSecret(context, dzverifySecretKey(slug)),
    hasSecret(context, turnstileSecretKey(slug)),
  ]);
  if (nextOtpEnabled && !otpHasSecret) {
    throw new SahelFlowError(
      "Enable WhatsApp OTP only after saving the dzverify API key",
      "STOREFRONT_GATE_SECRET_REQUIRED",
      400,
    );
  }
  if (nextTurnstileEnabled && !turnstileHasSecret) {
    throw new SahelFlowError(
      "Enable Turnstile only after saving the widget secret key",
      "STOREFRONT_GATE_SECRET_REQUIRED",
      400,
    );
  }

  const updated = await context.prisma.storefrontGateConfig.update({
    where: { storefrontSlug: slug },
    data: {
      otpEnabled: nextOtpEnabled,
      otpLanguage: input.otpLanguage,
      turnstileEnabled: nextTurnstileEnabled,
      ...(input.turnstileSiteKey !== undefined
        ? { turnstileSiteKey: input.turnstileSiteKey ?? null }
        : {}),
    },
  });
  void row;
  void dzverifyOutcome;
  void turnstileOutcome;

  const [hasDzverifyApiKey, hasTurnstileSecretKey] = await Promise.all([
    otpHasSecret,
    turnstileHasSecret,
  ]);
  return {
    storefrontSlug: updated.storefrontSlug,
    otpEnabled: updated.otpEnabled,
    otpLanguage: updated.otpLanguage,
    turnstileEnabled: updated.turnstileEnabled,
    turnstileSiteKey: updated.turnstileSiteKey,
    hasDzverifyApiKey,
    hasTurnstileSecretKey,
  };
}

export async function getPublicStorefrontGates(
  context: ServiceContext,
  storefrontSlug: string,
): Promise<PublicStorefrontGates> {
  const row = await context.prisma.storefrontGateConfig.findUnique({
    where: { storefrontSlug },
    select: {
      otpEnabled: true,
      otpLanguage: true,
      turnstileEnabled: true,
      turnstileSiteKey: true,
    },
  });
  return {
    otpEnabled: row?.otpEnabled ?? false,
    otpLanguage: row?.otpLanguage ?? "ar",
    turnstileEnabled: row?.turnstileEnabled ?? false,
    turnstileSiteKey: row?.turnstileSiteKey ?? null,
  };
}

/** Secret access for the enforcement path (submit route / otp service). */
export async function readDzverifyApiKey(
  context: ServiceContext,
  storefrontSlug: string,
): Promise<string | null> {
  return getSecret(context, dzverifySecretKey(storefrontSlug));
}

export async function readTurnstileSecret(
  context: ServiceContext,
  storefrontSlug: string,
): Promise<string | null> {
  return getSecret(context, turnstileSecretKey(storefrontSlug));
}
