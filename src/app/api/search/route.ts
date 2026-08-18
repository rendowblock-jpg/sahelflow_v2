import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { searchUniversalRecords } from "@/lib/search/universal-search-server";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 160;

/**
 * GET /api/search?q=...&limit=...
 *
 * One local-first universal record authority. Permission and shop isolation are
 * resolved on the server; the browser never fans one keystroke out across every
 * domain endpoint.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const query = (req.nextUrl.searchParams.get("q") ?? "").slice(
    0,
    MAX_QUERY_LENGTH,
  );
  const requestedLimit = Number.parseInt(
    req.nextUrl.searchParams.get("limit") ?? "16",
    10,
  );
  const result = await searchUniversalRecords(query, requestedLimit);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": `search;dur=${result.tookMs}`,
    },
  });
}, "GET /api/search");
