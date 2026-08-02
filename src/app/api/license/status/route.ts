import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getLicenseAuthorityProjection } from "@/lib/license/license-authority";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const projection = await getLicenseAuthorityProjection();
  return NextResponse.json(projection, {
    headers: { "Cache-Control": "no-store, private" },
  });
}, "GET /api/license/status");
