import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { requireLicense } from "@/lib/license/license-server";

export const dynamic = "force-dynamic";

/** GET /api/ai/sessions — list chat sessions with the latest durable preview. */
export const GET = withErrorHandler(async () => {
  await requireAuth("ai.use");
  const sessions = await db.aiChatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
  return NextResponse.json({ sessions });
}, "GET /api/ai/sessions");

const createSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
});

/** POST /api/ai/sessions — create a new locale-neutral chat session. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("ai.use");
  await requireLicense();
  const body = await req.json().catch(() => ({}));
  const input = createSchema.parse(body);
  const context = { prisma: db, shop: shopContext };
  const session = await context.prisma.aiChatSession.create({
    data: { title: input.title ?? null },
  });
  return NextResponse.json({ session }, { status: 201 });
}, "POST /api/ai/sessions");
