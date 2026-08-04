import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import {
  automationActionSchema,
  automationConditionGroupSchema,
  automationStepsSchema,
  automationTriggerSchema,
  canonicalizeAutomationMutation,
} from "@/lib/automations/contracts";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { SahelFlowError } from "@/types/errors";

type RouteContext = { params: Promise<{ id: string }> };

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    trigger: automationTriggerSchema.optional(),
    action: automationActionSchema.optional(),
    isActive: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    conditions: automationConditionGroupSchema.optional(),
    steps: automationStepsSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    maxRetries: z.number().int().min(0).max(8).optional(),
    retryDelayMs: z.number().int().min(100).max(300_000).optional(),
  })
  .strict();

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  return JSON.parse(value) as unknown;
}

/** PATCH — Update a definition, or explicitly deactivate an invalid legacy row. */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireAuth("automations.manage");
  const { id } = await params;
  const input = updateSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };
  const existing = await db.automation.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw new SahelFlowError("Automation not found", "NOT_FOUND", 404);
  }

  // A malformed historical definition may always be disabled. Re-enabling or
  // editing it requires submitting one complete valid final definition.
  const keys = Object.keys(input);
  if (keys.length === 1 && input.isActive === false) {
    const automation = await db.automation.update({
      where: { id },
      data: { isActive: false, nextRunAt: null },
    });
    await logAudit(context, {
      action: "automation.disabled",
      entity: "automation",
      entityId: id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });
    return NextResponse.json({ automation });
  }

  const canonical = canonicalizeAutomationMutation({
    name: input.name ?? existing.name,
    trigger: input.trigger ?? existing.trigger,
    action: input.action ?? existing.action,
    isActive: input.isActive ?? existing.isActive,
    dryRun: input.dryRun ?? existing.dryRun,
    conditions:
      input.conditions !== undefined
        ? input.conditions
        : (parseJson(existing.conditions) ?? null),
    steps:
      input.steps !== undefined
        ? input.steps
        : parseJson(existing.steps),
    config:
      input.config !== undefined
        ? input.config
        : parseJson(existing.config),
    maxRetries: input.maxRetries ?? existing.maxRetries,
    retryDelayMs: input.retryDelayMs ?? existing.retryDelayMs,
  });

  const automation = await db.automation.update({
    where: { id },
    data: {
      name: canonical.name,
      trigger: canonical.trigger,
      action: canonical.action,
      isActive: canonical.isActive,
      dryRun: canonical.dryRun,
      conditions: canonical.conditions
        ? JSON.stringify(canonical.conditions)
        : null,
      steps: JSON.stringify(canonical.steps),
      config: JSON.stringify(canonical.steps[0]!.config),
      maxRetries: canonical.maxRetries,
      retryDelayMs: canonical.retryDelayMs,
      retryCount: 0,
      lastError: null,
      nextRunAt: null,
    },
  });

  await logAudit(context, {
    action: "automation.updated",
    entity: "automation",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: {
      name: existing.name,
      trigger: existing.trigger,
      action: existing.action,
      isActive: existing.isActive,
      dryRun: existing.dryRun,
    },
    after: {
      name: automation.name,
      trigger: automation.trigger,
      action: automation.action,
      isActive: automation.isActive,
      dryRun: automation.dryRun,
    },
  });

  return NextResponse.json({ automation });
}, "PATCH /api/automations/[id]");

/** DELETE — Soft-delete a definition while preserving all durable history. */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireAuth("automations.manage");
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };
  const existing = await db.automation.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw new SahelFlowError("Automation not found", "NOT_FOUND", 404);
  }
  await db.automation.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, nextRunAt: null },
  });
  await logAudit(context, {
    action: "automation.deleted",
    entity: "automation",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: existing as Record<string, unknown>,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/automations/[id]");
