import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { updateCannedResponse, deleteCannedResponse } from "@/lib/data/canned-response-service";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  shortCode: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.parse(body);
  const response = await updateCannedResponse(id, parsed);
  return NextResponse.json({ response });
}, "PUT /api/canned-responses/[id]");

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  // W2-5: capture before-state for audit (deleteCannedResponse hard-deletes).
  const existing = await db.cannedResponse.findUnique({ where: { id } });
  await deleteCannedResponse(id);
  void logAudit({
    action: "canned_response.deleted",
    entity: "canned_response",
    entityId: id,
    actor: "user",
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/canned-responses/[id]");
