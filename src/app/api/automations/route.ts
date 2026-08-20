import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { canonicalizeAutomationMutation } from "@/lib/automations/contracts";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

/** POST — Create one fully validated automation definition. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("automations.manage");
  const input = canonicalizeAutomationMutation(await req.json());
  const context = { prisma: db, shop: shopContext };

  const automation = await context.prisma.automation.create({
    data: {
      name: input.name,
      trigger: input.trigger,
      action: input.action,
      isActive: input.isActive,
      dryRun: input.dryRun,
      conditions: input.conditions ? JSON.stringify(input.conditions) : null,
      steps: JSON.stringify(input.steps),
      config: JSON.stringify(input.steps[0]!.config),
      maxRetries: input.maxRetries,
      retryDelayMs: input.retryDelayMs,
      retryCount: 0,
      lastError: null,
      nextRunAt: null,
      runCount: 0,
    },
  });

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
  const latestRuns = automations.length
    ? await db.automationRun.findMany({
        where: { automationId: { in: automations.map((automation) => automation.id) } },
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
