import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import {
  AI_PROVIDER_ORDER_SETTING,
  AI_PROVIDER_ORDER_VALUES,
  parseProviderOrderSetting,
} from "@/lib/ai/providers/provider-order";

export const dynamic = "force-dynamic";

/** GET /api/ai/provider-order — which AI is tried first. */
export const GET = withErrorHandler(async () => {
  await requireAuth("integrations.manage");
  const stored = await getSetting({ prisma: db, shop: shopContext }, AI_PROVIDER_ORDER_SETTING);
  return NextResponse.json({ order: parseProviderOrderSetting(stored) });
}, "GET /api/ai/provider-order");

const bodySchema = z.object({ order: z.enum(AI_PROVIDER_ORDER_VALUES as [string, ...string[]]) });

/**
 * PUT /api/ai/provider-order — same permission as the keys (no PIN: it is a choice, not a secret). The setting is
 * reserved in the generic settings API, so this is the only way to change it.
 */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("integrations.manage");
  const { order } = bodySchema.parse(await req.json());
  await db.setting.upsert({
    where: { key: AI_PROVIDER_ORDER_SETTING },
    create: { key: AI_PROVIDER_ORDER_SETTING, value: order },
    update: { value: order },
  });
  return NextResponse.json({ ok: true, order });
}, "PUT /api/ai/provider-order");
