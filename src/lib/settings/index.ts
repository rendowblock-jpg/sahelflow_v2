/**
 * Settings service — non-secret app configuration (key/value, plaintext).
 *
 * Backed by the `Setting` Prisma model. For secret values (API keys, tokens),
 * use `@/lib/secrets` instead (AES-256-GCM encrypted `Secret` model).
 *
 * Values are stored as strings; callers parse them (boolean, number, JSON) as
 * needed. Helpers `getBool`, `getInt`, `getJson` are provided for convenience.
 *
 * SECURITY (SEC-002): `setSetting` rejects reserved keys (`auth_*`). This
 * prevents `PUT /api/settings` from overwriting `auth_pin_hash` / `auth_secret`
 * (which would be an auth-takeover vector). Internal callers that legitimately
 * need to write auth values (setupAuth, change-pin) bypass `setSetting` and
 * call `db.setting.upsert` directly — they are trusted server-side code paths.
 */
import "server-only";

import { db } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

/**
 * Reserved setting-key prefixes. Keys matching these cannot be written via
 * `setSetting` (and therefore via `PUT /api/settings`). They hold
 * security-sensitive values managed by dedicated, authenticated code paths.
 */
const RESERVED_SETTING_KEY_PREFIXES = ["auth_"] as const;

function isReservedSettingKey(key: string): boolean {
  return RESERVED_SETTING_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Get a single setting value by key, or `null` if not set. */
export async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Get a setting as a boolean (`true` if value === "true"). Default if unset. */
export async function getBool(key: string, defaultValue = false): Promise<boolean> {
  const v = await getSetting(key);
  if (v === null) return defaultValue;
  return v === "true";
}

/** Get a setting as an integer. Default if unset or unparseable. */
export async function getInt(key: string, defaultValue: number): Promise<number> {
  const v = await getSetting(key);
  if (v === null) return defaultValue;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

/** Get a setting as parsed JSON. Default if unset or unparseable. */
export async function getJson<T>(key: string, defaultValue: T): Promise<T> {
  const v = await getSetting(key);
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
 * SECURITY (SEC-002): Throws `SahelFlowError` (403) if the key is reserved
 * (`auth_*`). This is the guard that prevents `PUT /api/settings` from
 * overwriting auth secrets. Trusted internal callers (setupAuth, change-pin)
 * write auth values via `db.setting.upsert` directly, bypassing this check.
 */
export async function setSetting(key: string, value: string | number | boolean): Promise<void> {
  if (isReservedSettingKey(key)) {
    throw new SahelFlowError(
      `Cannot set reserved setting key '${key}' via the settings API`,
      "SETTING_RESERVED_KEY",
      403,
    );
  }
  const strValue = typeof value === "string" ? value : String(value);
  await db.setting.upsert({
    where: { key },
    create: { key, value: strValue },
    update: { value: strValue },
  });
}

/** Get all settings as a key→value record. */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

/** Delete a setting. No-op if not set. */
export async function deleteSetting(key: string): Promise<void> {
  await db.setting.deleteMany({ where: { key } });
}

// ── Well-known keys ────────────────────────────────────────────────────────

export const SETTING_KEYS = {
  dailyReportEnabled: "daily_report_enabled",
  dailyReportPhone: "daily_report_phone",
  dailyReportTime: "daily_report_time",
} as const;
