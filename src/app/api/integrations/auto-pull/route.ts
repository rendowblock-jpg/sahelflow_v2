/**
 * GET/PUT /api/integrations/auto-pull (INT-03 off switch).
 *
 * The scheduled courier and shop pull is ON by default. This is how a seller turns either half
 * off (and back on): two stored settings, read by the worker on every cycle. The right to change a
 * switch is the right to manage the thing it pulls: couriers need `delivery.credentials.manage`,
 * shops need `integrations.manage`. A request that names a switch the actor may not change changes
 * nothing at all. Writes leave one audit row with the before and after flags.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { db, shopContext, type DbClient } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  AUTO_PULL_COMMERCE_KEY,
  AUTO_PULL_COURIER_KEY,
  loadAutoPullSwitches,
} from "@/lib/integrations/scheduled-reconcile";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const COURIER_RIGHT = "delivery.credentials.manage";
const COMMERCE_RIGHT = "integrations.manage";

// Booleans only, no unknown keys, at least one switch. The text "False" or "off" is a 400, not a
// stored value: the reader treats only the exact text "false" as off.
const updateSchema = z
  .object({
    courier: z.boolean().optional(),
    commerce: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.courier !== undefined || value.commerce !== undefined,
    "Provide at least one switch",
  );

export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const actorContext = await requireTrustedActor();
  const resource = { shopId: actorContext.shop.shopId };
  const canManage = {
    courier: trustedActionAllowed(actorContext, COURIER_RIGHT, resource),
    commerce: trustedActionAllowed(actorContext, COMMERCE_RIGHT, resource),
  };
  if (!canManage.courier && !canManage.commerce) {
    // Throws the standard 403 when the actor may not even read integrations.
    assertTrustedAction(actorContext, "integrations.read", resource);
  }
  const switches = await loadAutoPullSwitches({ prisma: db, shop: shopContext });
  return NextResponse.json({ switches, canManage });
}, "GET /api/integrations/auto-pull");

export const PUT = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const actorContext = await requireTrustedActor();
  const resource = { shopId: actorContext.shop.shopId };
  const input = updateSchema.parse(await request.json());

  // Every switch named must be one the actor may change, BEFORE anything is written.
  if (input.courier !== undefined) {
    assertTrustedAction(actorContext, COURIER_RIGHT, resource);
  }
  if (input.commerce !== undefined) {
    assertTrustedAction(actorContext, COMMERCE_RIGHT, resource);
  }

  const { before, after } = await db.$transaction(
    async (transaction) => {
      const context = { prisma: transaction as unknown as DbClient, shop: shopContext };
      const previous = await loadAutoPullSwitches(context);
      if (input.courier !== undefined) {
        await setSetting(context, AUTO_PULL_COURIER_KEY, input.courier ? "true" : "false");
      }
      if (input.commerce !== undefined) {
        await setSetting(context, AUTO_PULL_COMMERCE_KEY, input.commerce ? "true" : "false");
      }
      return { before: previous, after: await loadAutoPullSwitches(context) };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  // Booleans, not a list of key names: the audit redaction filter replaces strings it does not
  // know with "[REDACTED]", booleans survive.
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "auto_pull.updated",
      entity: "settings",
      actor: trustedActorAuditIdentity(actorContext.actor),
      before,
      after,
      metadata: {
        courierChanged: input.courier !== undefined,
        commerceChanged: input.commerce !== undefined,
      },
    },
  );

  return NextResponse.json({
    switches: after,
    canManage: {
      courier: trustedActionAllowed(actorContext, COURIER_RIGHT, resource),
      commerce: trustedActionAllowed(actorContext, COMMERCE_RIGHT, resource),
    },
  });
}, "PUT /api/integrations/auto-pull");
