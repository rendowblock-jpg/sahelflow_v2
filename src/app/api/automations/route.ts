import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

const createSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  isActive: z.boolean().optional().default(true),
  conditions: z.any().optional(), // JSON-logic ConditionGroup
  steps: z.array(z.any()).optional(), // multi-step actions
  config: z.record(z.string(), z.any()).optional(), // action config (messageTemplate, targetStatus, etc.)
});

/** POST — Create a new automation */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = createSchema.parse(body);

  const automation = await db.automation.create({
    data: {
      name: input.name,
      trigger: input.trigger,
      action: input.action,
      isActive: input.isActive,
      conditions: input.conditions ? JSON.stringify(input.conditions) : null,
      steps: input.steps ? JSON.stringify(input.steps) : null,
      config: input.config ? JSON.stringify(input.config) : null,
      runCount: 0,
    },
  });

  return NextResponse.json({ automation }, { status: 201 });
}, "POST /api/automations");

/** GET — List all automations (excludes soft-deleted) */
export const GET = withErrorHandler(async () => {
  const automations = await db.automation.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ automations });
}, "GET /api/automations");
