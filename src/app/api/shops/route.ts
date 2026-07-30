import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listShops, createShop } from "@/lib/shops";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

/**
 * GET /api/shops — list all shops + the active shop ID.
 */
export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const actorContext = await requireTrustedAction("shops.read");
  const shops = listShops();
  const visibleShops = shops.filter((shop) => shop.id === actorContext.shop.shopId);
  return NextResponse.json({
    shops: visibleShops,
    activeShopId: actorContext.shop.shopId,
  });
}, "GET /api/shops");

const createShopSchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().max(10).optional().nullable(),
});

/**
 * POST /api/shops — create a new shop.
 * Body: { name: string, icon?: string | null }
 * Initializes the shop's SQLite file with the Prisma schema.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("shops.create");
  const body = await req.json();
  const input = createShopSchema.parse(body);
  const shop = createShop({ name: input.name, icon: input.icon ?? null });
  return NextResponse.json({ shop }, { status: 201 });
}, "POST /api/shops");
