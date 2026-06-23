/**
 * Centralized environment configuration.
 * All process.env access goes through here — no scattered process.env.X! in app code.
 * (Design system Section 12.2: "Centralized config module. No scattered constants.")
 *
 * Adding a new env var:
 *   1. Add it here (required() or optional())
 *   2. Use env.xxx everywhere — NEVER process.env.XXX in app code
 *   3. Add it to .env.example with a comment
 */

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

export const env = {
  /** Database URL (per-shop SQLite file) */
  databaseUrl: required("DATABASE_URL", "file:./data/shops/dev.db"),

  /** App version (for license version-gating) */
  appVersion: optional("APP_VERSION", "3.0.0") ?? "3.0.0",

  /** License public key (Ed25519, for verifying founder-signed licenses) */
  licensePublicKey: optional("LICENSE_PUBLIC_KEY", ""),

  /** Whether we're in development */
  isDev: process.env.NODE_ENV === "development",

  /** Whether we're running inside Tauri (desktop app) vs browser (dev) */
  isTauri: typeof window !== "undefined" && "__TAURI__" in window,

  // ── Crypto / PII ──────────────────────────────────────────────────────
  /** PII master key (64 hex chars = 32 bytes). If absent, falls back to keyfile. */
  sfMasterKey: optional("SF_MASTER_KEY"),
  /** Directory for the master keyfile + other local secrets */
  sfDataDir: optional("SF_DATA_DIR"),

  // ── Security ──────────────────────────────────────────────────────────
  /** Shared secret for cron-triggered API routes (/api/reports/daily, /api/integrations/sync) */
  cronSecret: optional("CRON_SECRET"),
  /** Client-exposed cron secret (for the Settings daily-report panel) */
  publicCronSecret: optional("NEXT_PUBLIC_CRON_SECRET", "dev"),

  // ── WhatsApp sidecar ──────────────────────────────────────────────────
  /** WhatsApp sidecar base URL (Baileys, default :3001) */
  whatsappSidecarUrl: optional("WHATSAPP_SIDECAR_URL", "http://localhost:3001"),
  /** Sidecar bearer-token auth (read from file by default) */
  sidecarTokenFile: optional("SIDECAR_TOKEN_FILE", "/tmp/sahelflow-sidecar-token"),
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
