/**
 * POST /api/license/sync — client syncs its validated license to the server.
 *
 * The client validates the license (Ed25519 signature or trial invariants)
 * and sends the result here. The server stores it so requireLicense() can
 * enforce server-side.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { setCachedLicenseResult } from "@/lib/license/license-service";
import type { LicenseValidationResult } from "@/lib/license/types";

const syncSchema = z.object({
  status: z.string(),
  daysRemaining: z.number().optional(),
  message: z.string().optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth();
  const body = await req.json();
  const input = syncSchema.parse(body) as LicenseValidationResult;

  // Store the validation result in the Setting table
  await db.setting.upsert({
    where: { key: "active_license_status" },
    create: { key: "active_license_status", value: JSON.stringify(input) },
    update: { value: JSON.stringify(input) },
  });

  // Update the in-memory cache
  setCachedLicenseResult(input);

  return NextResponse.json({ success: true });
}, "POST /api/license/sync");
