import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { db, shopContext } from "@/lib/db";
import { withDemoPolicyLock } from "@/lib/demo/algerian-demo-policy";
import {
  getMetaPixelConfig,
  upsertMetaPixelConfig,
  META_CAPI_TOKEN_SECRET_KEY,
} from "@/lib/meta/capi-authority";
import { hasSecret } from "@/lib/secrets";
import { CONVERSION_MODES } from "@/lib/meta/capi-conversion";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/meta-pixel — the pixel configuration (never the token).
 * `hasAccessToken` tells the UI a token is stored without exposing it.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("settings.read");
  const context = { prisma: db, shop: shopContext };
  const config = await getMetaPixelConfig(context);
  const hasAccessToken = await hasSecret(context, META_CAPI_TOKEN_SECRET_KEY);
  return NextResponse.json({ config, hasAccessToken });
}, "GET /api/settings/meta-pixel");

const upsertSchema = z.object({
  pixelId: z.string().trim().min(1).max(64),
  adAccountName: z.string().trim().max(120).nullish(),
  conversionEvent: z.enum(CONVERSION_MODES as unknown as [string, ...string[]]).optional(),
  testMode: z.boolean().optional(),
  testEventCode: z.string().trim().max(120).nullish(),
  enabled: z.boolean().optional(),
  accessToken: z.string().trim().max(600).optional(),
});

/**
 * PUT /api/settings/meta-pixel — upsert the config (manage authority).
 * The access token, when present, rides the encrypted Secret authority and is
 * never echoed back. Every write is audited.
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireAuth("settings.manage");
  const input = upsertSchema.parse(await request.json());

  const result = await withDemoPolicyLock(async () => {
    const ctx = { prisma: db, shop: shopContext };
    const config = await upsertMetaPixelConfig(ctx, {
      pixelId: input.pixelId,
      adAccountName: input.adAccountName ?? undefined,
      conversionEvent: input.conversionEvent as never,
      testMode: input.testMode,
      testEventCode: input.testEventCode ?? undefined,
      enabled: input.enabled,
      accessToken: input.accessToken,
    });
    const hasAccessToken = await hasSecret(ctx, META_CAPI_TOKEN_SECRET_KEY);
    return { config, hasAccessToken };
  });

  await logAudit({ prisma: db, shop: shopContext }, {
    action: "settings.meta_pixel.save",
    entity: "MetaPixelConfig",
    entityId: result.config.id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: {
      pixelId: result.config.pixelId,
      conversionEvent: result.config.conversionEvent,
      enabled: result.config.enabled,
      tokenReplaced: input.accessToken !== undefined,
    },
  });

  return NextResponse.json(result);
}, "PUT /api/settings/meta-pixel");
