import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { deleteWhatsAppChats } from "@/lib/whatsapp/chat-delete";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Conversation ids from the inbox projection, 1..100 per batch. The bound
  // follows the projection's own id space, not the cuid assumption: real
  // stores hold legacy, demo-prefixed and provider-derived ids (the Internal.33
  // installed campaign reproduced a legitimate 69-char id rejected by the
  // previous 64-char bound — founder finding F-04). 256 matches every other
  // provider-shape contract (conversationId in conversation-assignment, jid,
  // to, waMessageId).
  ids: z.array(z.string().min(1).max(256)).min(1).max(100),
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
  //
  // Round 3: the installed runtime's stderr is suppressed by design (native
  // containment), so the log line is unreachable on the founder's machine and
  // the API response is the ONLY diagnostic channel. Each rejection now
  // carries the same PII-free shape the log line holds (reason, issue paths,
  // id count/lengths, body size) so the installed dialog names the exact
  // failing condition.
  const rawBody = await req.text();
  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    logger.warn("api.POST /api/whatsapp/chats/delete.validation", {
      reason: "malformed_json",
      bodyLength: rawBody.length,
    });
    return NextResponse.json(
      {
        error: "Invalid chat deletion request",
        code: "INVALID_DELETE_REQUEST",
        rejection: {
          reason: "malformed_json",
          bodyLength: rawBody.length,
        },
      },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(jsonBody);
  if (!parsed.success) {
    const candidate = jsonBody as { ids?: unknown } | null;
    const issues = parsed.error.issues.map((issue) => issue.path.join("."));
    const idCount = Array.isArray(candidate?.ids)
      ? candidate.ids.length
      : -1;
    const idLengths = Array.isArray(candidate?.ids)
      ? candidate.ids.map((id) => (typeof id === "string" ? id.length : -1))
      : [];
    logger.warn("api.POST /api/whatsapp/chats/delete.validation", {
      reason: "schema_violation",
      issues,
      idCount,
      idLengths,
    });
    return NextResponse.json(
      {
        error: "Invalid chat deletion request",
        code: "INVALID_DELETE_REQUEST",
        rejection: {
          reason: "schema_violation",
          issues,
          idCount,
          idLengths,
          bodyLength: rawBody.length,
        },
      },
      { status: 400 },
    );
  }
  const result = await deleteWhatsAppChats(
    { prisma: db, shop: actorContext.shop },
    parsed.data.ids,
  );
  // Audit S3-20: ids that resolve to nothing (foreign shop, non-WhatsApp
  // channel, typo) must be named, not silently absorbed into ok:true —
  // multi-select deletion stays honest about what it actually removed.
  const notFoundIds = parsed.data.ids.filter(
    (id) => !result.deletedConversationIds.includes(id),
  );
  return NextResponse.json({
    ok: true,
    deleted: result.deletedConversationIds.length,
    deletedMessages: result.deletedMessageCount,
    conversationIds: result.deletedConversationIds,
    notFoundIds,
  });
}, "POST /api/whatsapp/chats/delete");
