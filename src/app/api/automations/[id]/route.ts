import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

// Mirrors the POST create schema. Allows partial updates so the editor can
// patch name/trigger/action/conditions/steps/config as well as toggle isActive.
// Previously only isActive + name were accepted (C-audit S3-1).
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  conditions: z.any().nullable().optional(), // JSON-logic ConditionGroup
  steps: z.array(z.any()).nullable().optional(),
  config: z.record(z.string(), z.any()).nullable().optional(),
});

/** PATCH — Update automation fields (name/trigger/action/conditions/isActive/etc.) */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const input = updateSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  const automation = await context.prisma.automation.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.trigger !== undefined && { trigger: input.trigger }),
      ...(input.action !== undefined && { action: input.action }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.conditions !== undefined && {
        conditions: input.conditions === null ? null : JSON.stringify(input.conditions),
      }),
      ...(input.steps !== undefined && {
        steps: input.steps === null ? null : JSON.stringify(input.steps),
      }),
      ...(input.config !== undefined && {
        config: input.config === null ? null : JSON.stringify(input.config),
      }),
    },
  });

  return NextResponse.json({ automation });
}, "PATCH /api/automations/[id]");

/** DELETE — Remove an automation */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };
  // W2-5: capture before-state for audit.
  const existing = await db.automation.findUnique({ where: { id } });
  // Soft-delete (Automation has deletedAt). Hard-deleting would cascade-wipe
  // AutomationLog rows and lose the execution audit trail (C-audit S2-8).
  await context.prisma.automation.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  void logAudit(context, {
    action: "automation.deleted",
    entity: "automation",
    entityId: id,
    actor: "user",
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/automations/[id]");
