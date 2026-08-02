/**
 * Settings service — non-secret app configuration (key/value, plaintext).
 *
 * Backed by the `Setting` Prisma model. For secret values (API keys, tokens),
 * use `@/lib/secrets` instead (AES-256-GCM encrypted `Secret` model).
 *
 * Values are stored as strings; callers parse them (boolean, number, JSON) as
 * needed. Helpers `getBool`, `getInt`, `getJson` are provided for convenience.
 *
 * SECURITY (SEC-002): `setSetting` rejects reserved keys and prefixes. This
 * prevents the bulk settings API from overwriting auth authority, quarantined
 * legacy license rows or lifecycle markers owned by dedicated server paths.
 */
import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";

/**
 * Reserved setting-key prefixes. Keys matching these cannot be written via
 * `setSetting` (and therefore via `PUT /api/settings`). They hold
 * security-sensitive values managed by dedicated, authenticated code paths.
 */
// SV-M1/M2: include "active_machine_id" (license-related, write-protected
// alongside the active_license_* keys — exposed machine IDs are a privacy
// risk + deleting the key forces license re-validation).
const RESERVED_SETTING_KEY_PREFIXES = [
  "auth_",
  "active_license",
  "active_machine_id",
  "identity_authority_",
] as const;

/**
 * Exact lifecycle keys whose values are authority, not user preferences.
 *
 * The Algerian demo loader/remover writes these directly through Prisma inside
 * the same transaction as its data graph. Allowing the generic Settings API to
 * clear the marker would leave realistic demo orders present while disabling
 * the external-effect guard.
 */
const RESERVED_SETTING_KEYS = new Set([
  "demo_seed_version",
  "demo_seed_created_at",
]);

function isReservedSettingKey(key: string): boolean {
  return (
    RESERVED_SETTING_KEYS.has(key) ||
    RESERVED_SETTING_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/** Get a single setting value by key, or `null` if not set. */
export async function getSetting(
  context: ServiceContext,
  key: string,
): Promise<string | null> {
  const row = await context.prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Get a setting as a boolean (`true` if value === "true"). Default if unset. */
export async function getBool(
  context: ServiceContext,
  key: string,
  defaultValue = false,
): Promise<boolean> {
  const v = await getSetting(context, key);
  if (v === null) return defaultValue;
  return v === "true";
}

/** Get a setting as an integer. Default if unset or unparseable. */
export async function getInt(
  context: ServiceContext,
  key: string,
  defaultValue: number,
): Promise<number> {
  const v = await getSetting(context, key);
  if (v === null) return defaultValue;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

/** Get a setting as parsed JSON. Default if unset or unparseable. */
export async function getJson<T>(
  context: ServiceContext,
  key: string,
  defaultValue: T,
): Promise<T> {
  const v = await getSetting(context, key);
  if (v === null) return defaultValue;
  try {
    return JSON.parse(v) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a setting value (upsert). Value is coerced to string.
 *
 * SECURITY: Throws `SahelFlowError` (403) if the key is reserved. Trusted
 * internal callers write reserved authority directly through Prisma from their
 * dedicated transaction; the general Settings API never may.
 */
export async function setSetting(
  context: ServiceContext,
  key: string,
  value: string | number | boolean,
): Promise<void> {
  if (isReservedSettingKey(key)) {
    throw new SahelFlowError(
      `Cannot set reserved setting key '${key}' via the settings API`,
      "SETTING_RESERVED_KEY",
      403,
    );
  }
  const strValue = typeof value === "string" ? value : String(value);
  await context.prisma.setting.upsert({
    where: { key },
    create: { key, value: strValue },
    update: { value: strValue },
  });
}

/**
 * Get all settings as a key→value record.
 *
 * Reserved keys are stripped on read. These hold security/lifecycle authority
 * that should never be exposed through the bulk GET /api/settings endpoint.
 * Per-key `getSetting(key)` remains available to trusted internal callers.
 */
export async function getAllSettings(
  context: ServiceContext,
): Promise<Record<string, string>> {
  const rows = await context.prisma.setting.findMany();
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (isReservedSettingKey(row.key)) continue;
    out[row.key] = row.value;
  }
  return out;
}

/**
 * Delete a setting. No-op if not set.
 *
 * SECURITY: dedicated authority keys cannot be removed through the general
 * settings service. Trusted lifecycle/reset paths use direct Prisma mutations.
 */
export async function deleteSetting(
  context: ServiceContext,
  key: string,
): Promise<void> {
  if (isReservedSettingKey(key)) {
    throw new SahelFlowError(
      `Cannot delete reserved setting key '${key}' via the settings API`,
      "SETTING_RESERVED_KEY",
      403,
    );
  }
  await context.prisma.setting.deleteMany({ where: { key } });
}

// ── Well-known keys ────────────────────────────────────────────────────────

export const SETTING_KEYS = {
  dailyReportEnabled: "daily_report_enabled",
  dailyReportPhone: "daily_report_phone",
  dailyReportTime: "daily_report_time",
  /**
   * fix-B6: Seller's informed consent to send WhatsApp message bodies
   * (containing customer phone, name, address) to Google Gemini's API
   * for AI order extraction. Defaults to false (no consent) — the
   * extraction + AI chat routes return 403 consent_required until the
   * seller explicitly opts in via Settings → AI.
   */
  geminiConsentAccepted: "gemini_consent_accepted",
} as const;
