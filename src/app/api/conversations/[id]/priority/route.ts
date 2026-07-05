import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { setConversationPriority } from "@/lib/data/conversation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  priority: z.enum(["urgent", "high", "medium", "low"]).nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.parse(body);
  const conv = await setConversationPriority(id, parsed.priority);
  return NextResponse.json({ conversation: conv });
}, "PATCH /api/conversations/[id]/priority");
