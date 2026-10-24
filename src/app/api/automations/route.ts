import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { canonicalizeAutomationMutation } from "@/lib/automations/contracts";
import { assertSellerAutomationWritePolicy } from "@/lib/automations/seller-policy";
import { logAudit } from "@/lib/audit";
import {
  automationCreateData,
  createAutomationOnce,
  splitAutomationCreateKey,
} from "@/lib/automations/create-command";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { assertAutomationEffectGrants } from "@/lib/automations/authoring-grants";
import { assertTrustedAction, trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { NotFoundError } from "@/types/errors";

/**
 * POST — Create one fully validated, seller-compatible automation definition.
 * With an optional `idempotencyKey` (UUID) the create goes through the command kernel, so a repeat of the same request replays
 * the first automation (INT-14). Without a key the request is handled as before.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("automations.manage");
  const { body, idempotencyKey } = splitAutomationCreateKey(await req.json());
  const input = canonicalizeAutomationMutation(body);
  assertSellerAutomationWritePolicy(input);
  // INT-05: the author must hold the grant of every outward effect they script.
  assertAutomationEffectGrants(input.steps, (action) =>
    assertTrustedAction(actorContext, action, { shopId: actorContext.shop.shopId }),
  );
  const context = { prisma: db, shop: shopContext };

  if (idempotencyKey !== undefined) {
    const command = await createAutomationOnce(
      { ...context, businessPrincipal: businessPrincipalFromTrustedActor(actorContext) },
      idempotencyKey,
      input,
    );
    const stored = await context.prisma.automation.findUnique({ where: { id: command.result.automationId } });
    if (!stored) throw new NotFoundError("Automation", command.result.automationId);
    return NextResponse.json(
      {
        automation: stored,
        command: { id: command.commandId, aggregateVersion: command.aggregateVersion, replayed: command.replayed },
      },
      { status: 201 },
    );
  }

  const automation = await context.prisma.automation.create({ data: automationCreateData(input) });

  await logAudit(context, {
    action: "automation.created",
    entity: "automation",
    entityId: automation.id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: {
      name: automation.name,
      trigger: automation.trigger,
      action: automation.action,
      isActive: automation.isActive,
      dryRun: automation.dryRun,
    },
  });

  return NextResponse.json({ automation }, { status: 201 });
}, "POST /api/automations");

/** GET — List definitions and recent durable aggregate state. */
export const GET = withErrorHandler(async () => {
  await requireAuth("automations.read");
  const automations = await db.automation.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  // Aggregate latest-run lookup (audit 7-a F6): the previous query scanned the
  // full AutomationRun history for every automation and discarded all but one
  // row per automation in JS. groupBy resolves each automation's newest run
  // timestamp in SQL, then only those rows are fetched — bounded by the number
  // of automations instead of the number of runs.
  const automationIds = automations.map((automation) => automation.id);
  const latestRunMarkers = automationIds.length
    ? await db.automationRun.groupBy({
        by: ["automationId"],
        where: { automationId: { in: automationIds } },
        _max: { createdAt: true },
      })
    : [];
  const latestRuns = latestRunMarkers.length
    ? await db.automationRun.findMany({
        where: {
          OR: latestRunMarkers.map((marker) => ({
            automationId: marker.automationId,
            createdAt: marker._max.createdAt ?? new Date(0),
          })),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          automationId: true,
          status: true,
          succeededStepCount: true,
          failedStepCount: true,
          skippedStepCount: true,
          stepCount: true,
          lastErrorCode: true,
          createdAt: true,
          completedAt: true,
        },
      })
    : [];
  const latestByAutomation = new Map<string, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (!latestByAutomation.has(run.automationId)) {
      latestByAutomation.set(run.automationId, run);
    }
  }
  return NextResponse.json({
    automations: automations.map((automation) => ({
      ...automation,
      latestRun: latestByAutomation.get(automation.id) ?? null,
    })),
  });
}, "GET /api/automations");
