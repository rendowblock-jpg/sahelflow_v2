import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { listCannedResponses, createCannedResponse } from "@/lib/data/canned-response-service";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_req: NextRequest) => {
  await requireAuth("conversations.read");
  const responses = await listCannedResponses({ prisma: db, shop: shopContext });
  return NextResponse.json({ responses });
}, "GET /api/canned-responses");

const createSchema = z.object({
  // Audit S3-14: bounded fields — shortCode/content/description were uncapped.
  shortCode: z.string().min(1).max(32),
  content: z.string().min(1).max(2000),
  description: z.string().max(500).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("conversations.update");
  const body = await req.json();
  const parsed = createSchema.parse(body);
  const response = await createCannedResponse({ prisma: db, shop: shopContext }, parsed);
  return NextResponse.json({ response }, { status: 201 });
}, "POST /api/canned-responses");
