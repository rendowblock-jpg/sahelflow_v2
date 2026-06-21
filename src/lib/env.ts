/**
 * Centralized environment configuration.
 * All process.env access goes through here — no scattered process.env.X! in app code.
 * (Design system Section 12.2: "Centralized config module. No scattered constants.")
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
} as const;

export type Env = typeof env;
