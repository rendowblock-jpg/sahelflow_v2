import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { requireLicense } from "@/lib/license/license-server";

export const dynamic = "force-dynamic";

/** GET /api/ai/sessions — list chat sessions. */
export const GET = withErrorHandler(async () => {
  await requireAuth();
  const sessions = await db.aiChatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 1, // just the first message for a preview
      },
    },
  });
  return NextResponse.json({ sessions });
}, "GET /api/ai/sessions");

const createSchema = z.object({
  title: z.string().optional(),
});

/** POST /api/ai/sessions — create a new chat session. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  await requireLicense();
  const body = await req.json().catch(() => ({}));
  const input = createSchema.parse(body);
  const session = await db.aiChatSession.create({
    data: { title: input.title ?? "Nouvelle conversation" },
  });
  return NextResponse.json({ session }, { status: 201 });
}, "POST /api/ai/sessions");
