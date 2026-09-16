import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { compareLandingPages } from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

const compareSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  productId: z.string().trim().min(1).max(100),
});

/**
 * FD-061 EX-4: sibling comparison — every landing page of one product
 * (any status, newest first) with its live stats. Per-product comparison
 * replaces formal A/B experiments in the research contract.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("storefront.read");
  const input = compareSchema.parse({
    slug: req.nextUrl.searchParams.get("slug") ?? undefined,
    productId: req.nextUrl.searchParams.get("productId") ?? undefined,
  });
  const pages = await compareLandingPages(
    { prisma: db, shop: shopContext },
    input,
  );
  return NextResponse.json({ pages });
}, "GET /api/storefront/landing-pages/compare");
