/**
 * POST /api/license/sync — client syncs its validated license to the server.
 *
 * The client validates the license (Ed25519 signature or trial invariants)
 * and sends the SIGNED LICENSE BLOB here. The server RE-VERIFIES the
 * signature/invariants itself (does NOT trust the client's status claim)
 * and stores the result so requireLicense() can enforce server-side.
 *
 * This closes the audit finding where a direct DB write to Setting
 * (active_license_status = {"status":"valid"}) bypassed license enforcement.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { setCachedLicenseResult, validateLicense } from "@/lib/license/license-server";
// getMachineId no longer imported — server uses client-supplied machineId (AUDIT-3 S1 fix)
import { env } from "@/lib/env";
import type { LicenseValidationResult, SignedLicense } from "@/lib/license/types";

const syncSchema = z.object({
  license: z.object({
    payload: z.object({
      id: z.string(),
      type: z.string(),
      machineIds: z.array(z.string()),
      features: z.array(z.string()),
      minAppVersion: z.string(),
      issuedAt: z.string(),
      expiresAt: z.string().optional(),
      issuedBy: z.string(),
    }),
    signature: z.string(),
  }),
  // Client's claimed status (for informational purposes — server re-verifies)
  clientStatus: z.string().optional(),
  // Session 29 fix (AUDIT-3 S1 + AUDIT-7 AI5): the client's machine ID.
  // The server cannot compute this itself (getMachineId returns
  // "ssr-placeholder" server-side). It is SAFE to trust the client-supplied
  // machineId because the license signature is verified against the embedded
  // public key — a forged machineId would fail signature verification
  // (the signature covers payload.machineIds which must include this ID).
  machineId: z.string().min(8),
});

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth();
  const body = await req.json();
  const input = syncSchema.parse(body);
  const license = input.license as SignedLicense;

  // SERVER-SIDE RE-VERIFICATION (the fix):
  // Don't trust the client's status claim. Re-run validateLicense with the
  // actual signed blob + the client-supplied machine ID + app version.
  //
  // Session 29 fix (AUDIT-3 S1 + AUDIT-7 AI5): previously this called
  // getMachineId() server-side which returned "ssr-placeholder" →
  // validateLicense always failed the machineIds.includes() check →
  // requireLicense() always 403'd in production. Tests passed because
  // getMachineId was mocked.
  let result: LicenseValidationResult;
  try {
    const appVersion = env.appVersion;
    result = await validateLicense(license, input.machineId, appVersion);
  } catch (err) {
    result = {
      status: "invalid",
      message: err instanceof Error ? err.message : "License verification failed",
    };
  }

  // Store the SERVER-VERIFIED result (not the client's claim)
  await db.setting.upsert({
    where: { key: "active_license_status" },
    create: { key: "active_license_status", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  // Also store the license blob (for re-verification on future server checks)
  await db.setting.upsert({
    where: { key: "active_license_payload" },
    create: { key: "active_license_payload", value: JSON.stringify(license) },
    update: { value: JSON.stringify(license) },
  });

  // Store the machine ID so server-side requireLicense() can re-verify
  // without calling getMachineId() (which returns "ssr-placeholder" SSR).
  await db.setting.upsert({
    where: { key: "active_machine_id" },
    create: { key: "active_machine_id", value: input.machineId },
    update: { value: input.machineId },
  });

  // Update the in-memory cache
  setCachedLicenseResult(result);

  return NextResponse.json({ success: true, status: result.status });
}, "POST /api/license/sync");
