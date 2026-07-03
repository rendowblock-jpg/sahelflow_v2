import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { listCannedResponses, createCannedResponse } from "@/lib/data/canned-response-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_req: NextRequest) => {
  await requireAuth();
  const responses = await listCannedResponses();
  return NextResponse.json({ responses });
}, "GET /api/canned-responses");

const createSchema = z.object({
  shortCode: z.string().min(1),
  content: z.string().min(1),
  description: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const parsed = createSchema.parse(body);
  const response = await createCannedResponse(parsed);
  return NextResponse.json({ response }, { status: 201 });
}, "POST /api/canned-responses");
