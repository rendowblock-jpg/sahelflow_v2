import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { assignConversation } from "@/lib/data/conversation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// `assignee` may be a user id string or null (to clear assignment).
const schema = z.object({
  assignee: z.string().min(1).nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.parse(body);
  const conv = await assignConversation(id, parsed.assignee);
  return NextResponse.json({ conversation: conv });
}, "PATCH /api/conversations/[id]/assign");
