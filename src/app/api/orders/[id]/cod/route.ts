/**
 * Removed legacy per-order COD scalar mutation.
 *
 * Collection is now a governed, versioned command and remittance is recorded
 * through canonical settlement lines. The old mark-collected/mark-remitted
 * booleans are compatibility projections only.
 */
import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (_request: Request, { params }: Ctx) => {
  await requireTrustedActor();
  const { id } = await params;
  return NextResponse.json(
    {
      error: "Legacy per-order COD mutation is no longer supported",
      code: "LEGACY_COD_MUTATION_REMOVED",
      orderId: id,
      collectionEndpoint: `/api/orders/${id}/cod/collection`,
      settlementEndpoint: "/api/accounting/cod-settlements",
    },
    {
      status: 410,
      headers: {
        Deprecation: "true",
        Link: `</api/orders/${id}/cod/collection>; rel="successor-version", </api/accounting/cod-settlements>; rel="successor-version"`,
      },
    },
  );
}, "PATCH /api/orders/[id]/cod");
