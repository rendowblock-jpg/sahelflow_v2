import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { canonicalizeAutomationMutation } from "@/lib/automations/contracts";

/** POST — Create one fully validated automation definition. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("automations.manage");
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
