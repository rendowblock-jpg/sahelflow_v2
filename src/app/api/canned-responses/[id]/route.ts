import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { updateCannedResponse, deleteCannedResponse } from "@/lib/data/canned-response-service";
import { z } from "zod";

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
  await deleteCannedResponse(id);
  return NextResponse.json({ success: true });
}, "DELETE /api/canned-responses/[id]");
