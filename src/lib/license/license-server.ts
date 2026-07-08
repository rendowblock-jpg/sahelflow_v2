/**
 * License service — SERVER-ONLY module (DB-backed enforcement).
 *
 * This module contains the functions that read from the database to enforce
 * license gates server-side. It MUST only be imported from:
 *   - Server Components (App Router)
 *   - API routes (route.ts handlers)
 *   - Other server-only lib modules
 *
 * NEVER import this from a client component or a `"use client"` hook —
 * `import "server-only"` will throw at build time, and the static `@/lib/db`
 * import pulls `master-key.ts` (fs, crypto) into the bundle.
 *
 * Background (Phase 2 build fix):
 *   Previously these functions lived in `license-service.ts` alongside the
 *   pure `validateLicense` / `issueTrial` helpers. Because Turbopack traces
 *   the entire module when any export is imported, the client hook
 *   `use-license.ts` (which only used the pure helpers) ended up bundling
 *   the dynamic `import("@/lib/db")` here → `db.ts` → `master-key.ts` →
 *   `import "server-only"` → 6 build errors. Splitting the pure helpers
 *   into `./license-client.ts` broke the chain.
 *
 * Cache design:
 *   License is validated once on app launch (client-side, via use-license.ts)
 *   and the SIGNED LICENSE BLOB is synced to the server via POST
 *   /api/license/sync. The server RE-VERIFIES the signature (does not trust
 *   the client's status claim) and stores the result in the Setting table.
 *   `isLicenseValid()` here reads that stored blob, re-verifies it, and
 *   caches the result for `CACHE_TTL_MS` (5 min) to avoid re-validating on
 *   every API call.
 *
 * Fail-closed:
 *   In production, if no license is synced, the DB is unreachable, or
 *   re-verification fails → `isLicenseValid()` returns false. API routes
 *   that call `requireLicense()` will 403. The user must obtain a real
 *   license or self-issue a trial (which the client syncs to the server).
 */

import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { SahelFlowError } from "@/types/errors";
import type { LicenseValidationResult, SignedLicense } from "./types";
import { validateLicense } from "./license-client";

// Re-export validateLicense so server code (e.g. /api/license/sync) can
// import both the pure verifier and the DB-backed cache helpers from one
// module. This re-export does NOT make validateLicense server-only — it's
// still pure and lives in license-client.ts; we just re-surface it here
// for ergonomic server-side imports.
export { validateLicense } from "./license-client";

// Read NODE_ENV at call time (not module load) so tests can mutate it.
function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Cache the last validation result to avoid re-validating on every API call.
 * License is validated once on app launch + cached. Re-validated every 5 min.
 */
let cachedResult: LicenseValidationResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the current license is valid.
 *
 * SERVER-ONLY: reads the synced license BLOB + machine ID from the DB and
 * RE-VERIFIES the signature server-side (does not trust the stored status
 * blob — a direct DB write could forge it).
 *
 * Signature differs from the client-safe `isLicenseValid(license, machineId,
 * appVersion)` in `./license-client.ts` — that one takes the license as an
 * arg; this one reads it from storage. Do not confuse the two.
 *
 * In dev mode, always returns true (license bypassed).
 * In production, checks the cached validation result (or validates fresh).
 */
export async function isLicenseValid(): Promise<boolean> {
  if (isDevMode()) return true;
  if (cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResult.status === "valid";
  }

  // Read the synced license BLOB + status from the DB.
  // SECURITY: we re-verify the license signature server-side (don't trust
  // the stored status blob — a direct DB write could forge it). The sync
  // route already re-verifies on sync, but this catches post-sync tampering.
  try {
    const [statusRow, payloadRow] = await Promise.all([
      db.setting.findUnique({ where: { key: "active_license_status" } }),
      db.setting.findUnique({ where: { key: "active_license_payload" } }),
    ]);

    if (statusRow?.value && payloadRow?.value) {
      // Re-verify the license blob against the public key.
      //
      // Session 29 fix (AUDIT-3 S1 + AUDIT-7 AI5): previously this called
      // getMachineId() which returns "ssr-placeholder" server-side →
      // validateLicense always failed the machineIds.includes() check →
      // requireLicense() always 403'd in production.
      // Now we read the machine ID that the client persisted via /api/license/sync.
      const license = JSON.parse(payloadRow.value) as SignedLicense;
      const machineIdRow = await db.setting.findUnique({ where: { key: "active_machine_id" } });
      if (!machineIdRow?.value) {
        // No machine ID synced yet — license not properly activated.
        // Fail-closed in production.
        return false;
      }
      const result = await validateLicense(license, machineIdRow.value, env.appVersion);
      cachedResult = result;
      cachedAt = Date.now();
      return result.status === "valid";
    }

    // Legacy: only status row exists (pre-fix sync). Trust it once, then
    // the next sync will migrate to the verified-blob flow.
    //
    // SV-L5 — SECURITY RISK (accepted): a direct DB write of
    //   `{ status: "valid" }` to `active_license_status` grants access
    //   until the next /api/license/sync re-verifies. Full mitigation
    //   requires re-verifying the signature here, but the legacy row
    //   stores a LicenseValidationResult (no signed payload), so we
    //   cannot re-verify from this row alone. Mitigations in place:
    //     1. This branch only fires for pre-fix installs that haven't
    //        synced since the S1 fix — after first sync the verified-
    //        blob flow above takes over.
    //     2. The DB file is local SQLite under the seller's OS account;
    //        an attacker who can write to it already owns the machine.
    //     3. The 5-min cache TTL means a forged row stops working as
    //        soon as the next sync happens.
    //   TODO: drop this legacy branch once all beta installs have synced
    //   to the verified-blob flow (track via a telemetry counter).
    if (statusRow?.value) {
      const result = JSON.parse(statusRow.value) as LicenseValidationResult;
      cachedResult = result;
      cachedAt = Date.now();
      return result.status === "valid";
    }
  } catch {
    // DB not ready — fall through
  }

  // No license synced — fail-closed in production.
  return false;
}

/**
 * Require a valid license — throws 403 if invalid.
 * Use in API routes: `await requireLicense();`
 */
export async function requireLicense(): Promise<void> {
  const valid = await isLicenseValid();
  if (!valid) {
    throw new SahelFlowError("License required", "LICENSE_REQUIRED", 403);
  }
}

/**
 * Check if the current license includes a specific feature.
 * All licenses (trial + permanent) include "all" features by default.
 * Use for feature gating: `if (await hasFeature("ai_chat")) { ... }`
 */
export async function hasFeature(feature: string): Promise<boolean> {
  if (isDevMode()) return true;
  // SV-L4: previously this checked `cachedResult` directly without first
  // calling isLicenseValid(). If hasFeature() was the first license call
  // in a process (e.g. an API route that gates on a feature, not on
  // requireLicense()), cachedResult was null → hasFeature always returned
  // false even for valid licenses. Calling isLicenseValid() first ensures
  // the cache is populated (and re-verified on the 5-min cadence).
  const valid = await isLicenseValid();
  if (!valid || !cachedResult || cachedResult.status !== "valid") return false;
  const features = cachedResult.license?.payload?.features ?? [];
  return features.includes("all") || features.includes(feature);
}

/** Well-known feature keys for gating. */
export const FEATURE_KEYS = {
  AI_CHAT: "ai_chat",
  STOREFRONT: "storefront",
  ECOMMERCE_SYNC: "ecommerce_sync",
  MULTI_SHOP: "multi_shop",
  DAILY_REPORTS: "daily_reports",
  GOOGLE_SHEETS: "google_sheets",
} as const;

/** Update the cached license validation result (called from client after check). */
export function setCachedLicenseResult(result: LicenseValidationResult | null): void {
  cachedResult = result;
  cachedAt = Date.now();
}
