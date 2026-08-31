import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { SahelFlowError } from "@/types/errors";
import { deleteWhatsAppChats } from "@/lib/whatsapp/chat-delete";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Canonical Conversation ids from the inbox projection, 1..100 per batch.
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
});

/**
 * Permanent multi-select chat deletion (founder-confirmed contract).
 * Removes the chats with their messages, durable provider effects, ingress
 * events and encrypted local media from this store. Provider-side copies on
 * WhatsApp remain, by design — SahelFlow never impersonates account-level
 * provider deletion.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.delete");
  // Coded, logged rejection for malformed bodies (campaign row B5): the
  // previous bare schema.parse surfaced an anonymous 400 with no code and no
  // log line, making installed-build diagnosis impossible. Ids are never
  // logged — only their shape.
  const rawBody = await req.text();
  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    logger.warn("api.POST /api/whatsapp/chats/delete.validation", {
      reason: "malformed_json",
      bodyLength: rawBody.length,
    });
    throw new SahelFlowError(
      "Invalid chat deletion request",
      "INVALID_DELETE_REQUEST",
      400,
    );
  }
  const parsed = schema.safeParse(jsonBody);
  if (!parsed.success) {
    const candidate = jsonBody as { ids?: unknown } | null;
    logger.warn("api.POST /api/whatsapp/chats/delete.validation", {
      reason: "schema_violation",
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
      idCount: Array.isArray(candidate?.ids) ? candidate.ids.length : -1,
      idLengths: Array.isArray(candidate?.ids)
        ? candidate.ids.map((id) => (typeof id === "string" ? id.length : -1))
        : [],
    });
    throw new SahelFlowError(
      "Invalid chat deletion request",
      "INVALID_DELETE_REQUEST",
      400,
    );
  }
  const result = await deleteWhatsAppChats(
    { prisma: db, shop: actorContext.shop },
    parsed.data.ids,
  );
  return NextResponse.json({
    ok: true,
    deleted: result.deletedConversationIds.length,
    deletedMessages: result.deletedMessageCount,
    conversationIds: result.deletedConversationIds,
  });
}, "POST /api/whatsapp/chats/delete");
