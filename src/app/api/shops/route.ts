import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getIdentityAdministrationSnapshot } from "@/lib/identity/control-authority";
import { listShops, createShop } from "@/lib/shops";

export const dynamic = "force-dynamic";

/**
 * GET /api/shops — list the exact registry shops granted to the durable member.
 */
export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const actorContext = await requireTrustedAction("shops.read");
  const shops = listShops();

  if (actorContext.actor.kind === "person") {
    const identity = await getIdentityAdministrationSnapshot(
      actorContext.actor.sessionId,
      actorContext.shop,
    );
    const actorMatches =
      identity.workspace.id === actorContext.shop.workspaceId &&
      identity.installation.id === actorContext.shop.installationId &&
      identity.currentActor.personId === actorContext.actor.personId &&
      identity.currentActor.workspaceMemberId ===
        actorContext.actor.workspaceMemberId &&
      identity.currentActor.deviceId === actorContext.actor.deviceId &&
      identity.currentActor.policyVersion === actorContext.actor.policyVersion &&
      identity.currentActor.revocationEpoch ===
        actorContext.actor.revocationEpoch &&
      identity.member.id === actorContext.actor.workspaceMemberId;
    const grantedShopIds = actorMatches
      ? new Set(identity.member.shopIds)
      : new Set<string>();
    return NextResponse.json({
      shops: shops.filter((shop) => grantedShopIds.has(shop.id)),
      activeShopId: actorContext.shop.shopId,
    });
  }

  return NextResponse.json({
    shops: shops.filter((shop) => shop.id === actorContext.shop.shopId),
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
