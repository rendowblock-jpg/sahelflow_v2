import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getIdentityAdministrationSnapshot } from "@/lib/identity/control-authority";
import { listShops } from "@/lib/shops";
import { enqueueAuthorizedNativeLifecycle } from "@/lib/shops/native-lifecycle-authority";

export const dynamic = "force-dynamic";

/** GET /api/shops — list the exact registry shops granted to the durable member. */
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

const createShopSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    icon: z.string().max(32).optional().nullable(),
  })
  .strict();

/** POST /api/shops — authorize and enqueue native shop provisioning. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const input = createShopSchema.parse(await req.json());
  const operation = await enqueueAuthorizedNativeLifecycle({
    action: "shops.create",
    operation: "create",
    payload: {
      operation: "create",
      name: input.name,
      icon: input.icon ?? null,
    },
    target: null,
  });

  return NextResponse.json(
    { status: "pending", operationId: operation.operationId },
    { status: 202 },
  );
}, "POST /api/shops");
