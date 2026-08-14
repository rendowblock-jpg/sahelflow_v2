/**
 * Centralized environment configuration with boot-time validation.
 *
 * All process.env access goes through here — no scattered process.env.X! in
 * app code. (Design system Section 12.2: "Centralized config module.")
 *
 * Phase 0 enhancement (R-3 pattern): Zod validation runs at module load.
 * Malformed values (e.g. a non-hex SF_MASTER_KEY, a non-URL sidecar URL, a
 * bogus log level) fail at BOOT with a clear error — not at first use in a
 * request. Missing required values still fall back to defaults (so dev "just
 * works"); validation only rejects VALUES THAT ARE PRESENT BUT MALFORMED.
 *
 * Adding a new env var:
 *   1. Add it to the `env` object below (required() or optional())
 *   2. Add a Zod validator to VALIDATORS if the format matters
 *   3. Use env.xxx everywhere — NEVER process.env.XXX in app code
 *   4. Add it to .env.example with a comment
 */
import { z } from "zod";

/**
 * Detect whether code is running inside the Tauri 2 desktop shell.
 *
 * Tauri 2 defaults `app.withGlobalTauri` to `false`, so the legacy
 * `"__TAURI__" in window` check is ALWAYS false in production — which
 * silently broke license enforcement and the auto-updater (T-S1).
 * `__TAURI_INTERNALS__` is unconditionally injected by the Tauri 2
 * webview regardless of the `withGlobalTauri` flag, making it the
 * correct detection signal. Use this helper everywhere instead of
 * hand-rolling `in window` checks.
 */
export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function optional(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Zod validators for env vars whose FORMAT matters. Only validates values
 * that are actually present — absent values fall back to defaults (above).
 * Runs once at module load (boot). Throws a clear, actionable error on
 * the first malformed value.
 */
const VALIDATORS: Record<string, z.ZodType> = {
  // 32-byte master key = 64 hex chars
  SF_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "SF_MASTER_KEY must be 64 hex chars (32 bytes)"),
  WHATSAPP_SIDECAR_URL: z.string().url("WHATSAPP_SIDECAR_URL must be a valid URL"),
  SF_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
  YALIDINE_API_BASE: z.string().url(),
  MAYSTRO_API_BASE: z.string().url(),
  ZREXPRESS_API_BASE: z.string().url(),
  NEXT_PUBLIC_CRON_SECRET: z.string().min(1),
  SF_CONNECTED_CONTROL_ORIGIN: z.string().url(),
  SF_CONNECTED_STOREFRONT_ORIGIN: z.string().url(),
  SF_CONNECTED_BACKUP_ORIGIN: z.string().url(),
};

function validateEnv(): void {
  // Skip in test/CI to avoid coupling test setup to env shape.
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.npm_lifecycle_event === "lint"
  ) {
    return;
  }
  const errors: string[] = [];
  for (const [key, schema] of Object.entries(VALIDATORS)) {
    const raw = process.env[key];
    if (raw === undefined || raw === "") continue; // only validate present values
    const result = schema.safeParse(raw);
    if (!result.success) {
      errors.push(`  ${key}: ${result.error.issues[0]?.message ?? "invalid"}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[env] Invalid environment variables:\n${errors.join("\n")}\n` +
        `Fix the values in your .env file and restart.`,
    );
  }
}

validateEnv();

export const env = {
  /** Database URL (per-shop SQLite file) */
  databaseUrl: required("DATABASE_URL", "file:./data/shops/dev.db"),

  /** App version (for license version-gating) */
  // SV-L7: keep in sync with package.json "version" (currently 4.1.0).
  // At Tauri build time, scripts/release.ts writes APP_VERSION into the
  // env from package.json — this default only fires for raw `next dev`
  // without a .env file.
  appVersion: optional("APP_VERSION", "4.1.0") ?? "4.1.0",

  /** Whether we're in development */
  isDev: process.env.NODE_ENV === "development",

  /**
   * Whether we're running inside Tauri (desktop app) vs browser (dev).
   * Delegates to `isTauriEnv()` (T-S1) — never inline `__TAURI__` checks.
   */
  isTauri: isTauriEnv(),

  // ── Crypto / PII ──────────────────────────────────────────────────────
  /** PII master key (64 hex chars = 32 bytes). If absent, falls back to keyfile. */
  sfMasterKey: optional("SF_MASTER_KEY"),
  /** Directory for the master keyfile + other local secrets */
  sfDataDir: optional("SF_DATA_DIR"),

  // ── Security ──────────────────────────────────────────────────────────
  /** Shared secret for cron-triggered API routes (/api/reports/daily, /api/integrations/sync) */
  cronSecret: optional("CRON_SECRET"),
  /** Client-exposed cron secret (for the Settings daily-report panel) */
  // SV-L6: previously defaulted to "dev" — if a seller didn't set this,
  // cron endpoints silently accepted ?secret=dev (a publicly-known
  // value). Now defaults to "" (empty) which the route rejects via
  // constantTimeEqual. Sellers must set NEXT_PUBLIC_CRON_SECRET to use
  // the in-app "Test Now" button; production cron jobs use the
  // server-only CRON_SECRET instead.
  publicCronSecret: optional("NEXT_PUBLIC_CRON_SECRET", ""),

  // ── Connected platform ───────────────────────────────────────────────────
  /** Public service origins; bearer authorities remain encrypted per shop. */
  connectedControlOrigin: optional("SF_CONNECTED_CONTROL_ORIGIN"),
  connectedStorefrontOrigin: optional("SF_CONNECTED_STOREFRONT_ORIGIN"),
  connectedBackupOrigin: optional("SF_CONNECTED_BACKUP_ORIGIN"),
  /** Mirrors the native survivability controller's optional backup root. */
  backupDirectory: optional("SF_BACKUP_DIRECTORY"),

  // ── WhatsApp sidecar ──────────────────────────────────────────────────
  /** WhatsApp sidecar base URL (Baileys, default :3001) */
  whatsappSidecarUrl: optional("WHATSAPP_SIDECAR_URL", "http://localhost:3001"),
  /** Sidecar bearer-token auth (read from file by default) */
  // T-P5: use os.tmpdir() so the path resolves correctly on Windows
  // (was hardcoded "/tmp/..." which doesn't exist on Windows).
  sidecarTokenFile: optional("SIDECAR_TOKEN_FILE") ?? (typeof process !== "undefined" && process.platform === "win32" ? `${process.env.TEMP ?? process.env.TMP ?? "C:\\Windows\\Temp"}\\sahelflow-sidecar-token` : "/tmp/sahelflow-sidecar-token"),
  sidecarToken: optional("SIDECAR_TOKEN"),

  // ── Logging ───────────────────────────────────────────────────────────
  /** Log level override (debug/info/warn/error) */
  logLevel: optional("SF_LOG_LEVEL"),

  // ── Delivery provider API bases (overridable for testing) ─────────────
  yalidineApiBase: optional("YALIDINE_API_BASE", "https://api.yalidine.app/v1"),
  maystroApiBase: optional("MAYSTRO_API_BASE", "https://backend.maystro-delivery.com/api"),
  zrExpressApiBase: optional("ZREXPRESS_API_BASE", "https://procolis.com/api_v1"),

  // ── Sidecar port ( informational ) ────────────────────────────────────
  whatsappSidecarPort: optionalInt("WHATSAPP_SIDECAR_PORT", 3001),
} as const;

export type Env = typeof env;
