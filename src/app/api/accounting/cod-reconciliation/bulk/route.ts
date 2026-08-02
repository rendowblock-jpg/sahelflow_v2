/**
 * Removed legacy bulk COD remittance mutation.
 *
 * A scalar "mark remitted" update cannot represent canonical settlement lines,
 * fees, adjustments, discrepancies, matching, optimistic versions or replay.
 * Callers must post a governed settlement instead.
 */
import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (_request: Request) => {
  await requireTrustedAction("accounting.update");
  return NextResponse.json(
    {
      error: "Legacy bulk COD remittance is no longer supported",
      code: "LEGACY_COD_MUTATION_REMOVED",
      canonicalEndpoint: "/api/accounting/cod-settlements",
    },
    {
      status: 410,
      headers: {
        Deprecation: "true",
        Link: '</api/accounting/cod-settlements>; rel="successor-version"',
      },
    },
  );
}, "POST /api/accounting/cod-reconciliation/bulk");
