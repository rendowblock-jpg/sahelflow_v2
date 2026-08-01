/**
 * Deprecated compatibility alias for the canonical COD workspace.
 *
 * This route is read-only and delegates to the same append-only accounting
 * projection as `/api/accounting/cod-settlements`. Legacy scalar COD fields are
 * no longer a reconciliation authority.
 */
import { NextResponse } from "next/server";

import { getCanonicalCodWorkspaceSummary } from "@/lib/accounting/canonical-cod-projections";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

const compatibilityHeaders = {
  Deprecation: "true",
  Link: '</api/accounting/cod-settlements>; rel="successor-version"',
};

export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedActor();
  assertTrustedAction(actorContext, "accounting.read");
  const summary = await getCanonicalCodWorkspaceSummary({
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  });
  return NextResponse.json(
    {
      summary,
      deprecated: true,
      canonicalEndpoint: "/api/accounting/cod-settlements",
    },
    { headers: compatibilityHeaders },
  );
}, "GET /api/accounting/cod-reconciliation");
