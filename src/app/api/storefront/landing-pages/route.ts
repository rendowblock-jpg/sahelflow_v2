import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import {
  createLandingPage,
  landingPageSchema,
  listLandingPages,
} from "@/lib/storefront/landing-page-service";

export const dynamic = "force-dynamic";

const listSchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  productId: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

/**
 * FD-061 EX-4: seller management of per-product landing pages.
 * GET  — list (optionally per storefront/product/status), newest first,
 *        with live stats (views / orders / revenue / CVR).
 * POST — create one page as a draft (storefront.manage).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("storefront.read");
  const filters = listSchema.parse({
    slug: req.nextUrl.searchParams.get("slug") ?? undefined,
    productId: req.nextUrl.searchParams.get("productId") ?? undefined,
    status: req.nextUrl.searchParams.get("status") ?? undefined,
  });
  const pages = await listLandingPages(
    { prisma: db, shop: shopContext },
    filters,
  );
  return NextResponse.json({ pages });
}, "GET /api/storefront/landing-pages");

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("storefront.manage");
  const input = landingPageSchema.parse(await req.json());

  const page = await createLandingPage(
    { prisma: db, shop: shopContext },
    input,
  );
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "landingpage.created",
      entity: "landingPage",
      entityId: page.id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: page as unknown as Record<string, unknown>,
    },
  );
  return NextResponse.json({ page }, { status: 201 });
}, "POST /api/storefront/landing-pages");
