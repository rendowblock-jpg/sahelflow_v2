import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { buildPhotoStatus, getPhotoProgress } from "@/lib/storefront/media-host";
import { createMediaLedger, type MediaLedgerDb } from "@/lib/storefront/media-ledger";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const STOREFRONT_ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * GET /api/storefront/media/status?storefrontId=...
 *   Where each product photo stands: hosted, waiting, only on this PC, a link
 *   the seller pasted, or a file missing from this PC. Reads the local ledger
 *   and the files only; it never calls the cloud.
 */
export const GET = withErrorHandler(
  async (req: NextRequest) => {
    await requireTrustedAction("storefront.read");
    const storefrontId = new URL(req.url).searchParams.get("storefrontId") ?? "";
    if (!STOREFRONT_ID.test(storefrontId)) {
      throw new SahelFlowError("A valid storefrontId is required", "INVALID_STOREFRONT_ID", 400);
    }
    const context = { prisma: db, shop: shopContext };
    const { storefrontService } = await import("@/lib/storefront/service");
    if (!(await storefrontService.getById(context, storefrontId))) {
      throw new SahelFlowError("Storefront not found", "NOT_FOUND", 404);
    }
    const products = await db.product.findMany({
      where: { images: { not: null } },
      select: { id: true, images: true },
      take: 2000,
    });
    const status = await buildPhotoStatus({
      products,
      shopId: shopContext.shopId,
      storefrontId,
      // Prisma's Setting delegate has the same three calls the ledger uses.
      ledger: createMediaLedger(db as unknown as MediaLedgerDb),
    });
    return NextResponse.json({ ...status, progress: getPhotoProgress(storefrontId) });
  },
  "GET /api/storefront/media/status",
);
