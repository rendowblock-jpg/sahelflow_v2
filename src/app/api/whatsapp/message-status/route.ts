import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readFileSync } from "fs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { jidToPhone } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/message-status — receive WhatsApp delivery-ack updates
 * from the sidecar (W3-12).
 *
 * The sidecar's `messages.update` Baileys listener fires for every delivery
 * status change (PENDING → SENT → DELIVERY_ACK → READ) and for failures
 * (error present). The sidecar POSTs these updates here so the failure
 * status (and, when possible, delivery/read receipts) are PERSISTED to the
 * DB — without this, a failed message shows a red icon only until the next
 * inbox reload, after which the seller has no indication the message never
 * reached the customer.
 *
 * Auth: the sidecar authenticates with `Authorization: Bearer <SIDECAR_TOKEN>`
 * (the same shared token the Next.js app uses to call the sidecar). The
 * endpoint also accepts a user session (requireAuth) so a future browser-side
 * retry flow can call it directly.
 *
 * Persistence strategy:
 *   - Failures (deliveryStatus="failed" or error present): ALWAYS logged to
 *     the audit log (action="whatsapp.message.failed") with the waMessageId,
 *     jid, phone, and error — this is the durable record that survives
 *     reloads and powers the "failed messages" indicator.
 *   - Best-effort Message row update: if a Conversation exists for this JID
 *     (channel="whatsapp", sourceId=jid) AND it has a recent outbound Message
 *     (direction="outbound", deliveryStatus in ["sending","sent"], last 10
 *     min), update its deliveryStatus. This covers the case where WhatsApp
 *     messages are persisted to Message rows (future work / activity
 *     messages). If no match, the audit log alone is the record.
 *
 * NOTE: WhatsApp chat messages currently live in the sidecar's in-memory
 * store, NOT in the DB Message table (the inbox UI loads them via
 * /api/whatsapp/chats/:jid/messages). So the best-effort Message update
 * will usually be a no-op — the audit log is the primary persistence
 * mechanism. When WhatsApp messages are eventually persisted to Message
 * rows (with a waMessageId column), this endpoint will automatically
 * update them without changes.
 */

const statusSchema = z.object({
  waMessageId: z.string().min(1).max(256),
  jid: z.string().min(1).max(256),
  fromMe: z.boolean().optional().default(true),
  deliveryStatus: z.enum(["sending", "sent", "delivered", "read", "failed"]),
  error: z.string().max(2000).optional(),
});

/**
 * Resolve the expected sidecar bearer token — same logic as the sidecar's
 * index.ts + the Next.js sidecar-client.ts (env > file). Used to verify the
 * Authorization header on inbound POSTs from the sidecar.
 */
function resolveExpectedSidecarToken(): string | undefined {
  const fromEnv = env.sidecarToken;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    const fromFile = readFileSync(env.sidecarTokenFile, "utf8").trim();
    if (fromFile.length >= 16) return fromFile;
  } catch {
    // token file doesn't exist / unreadable
  }
  return undefined;
}

/**
 * Authenticate the request. Accepts either:
 *   1. Authorization: Bearer <SIDECAR_TOKEN> (sidecar → app call), OR
 *   2. A valid user session (browser → app call, for future retry flow).
 * Returns true if either auth path succeeds.
 */
async function authenticate(req: NextRequest): Promise<boolean> {
  // 1. Sidecar bearer token
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]) {
    const expected = resolveExpectedSidecarToken();
    if (expected && constantTimeEqual(m[1], expected)) {
      return true;
    }
    // Bearer token present but invalid — don't fall through to user auth
    // (a browser wouldn't send a Bearer header; this is a sidecar call with
    // a wrong token). Reject.
    return false;
  }
  // 2. User session (browser call)
  try {
    await requireAuth();
    return true;
  } catch {
    return false;
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!(await authenticate(req))) {
    return NextResponse.json(
      { error: "Unauthorized — invalid sidecar token or user session" },
      { status: 401 },
    );
  }

  const body = await req.json();
  const input = statusSchema.parse(body);

  const phone = jidToPhone(input.jid);
  const isFailure = input.deliveryStatus === "failed" || !!input.error;

  // ── Best-effort: update a matching Message row's deliveryStatus ────────
  // Look up the conversation by sourceId (JID) — contactPhone is PII-encrypted
  // and not searchable (see pii-fields.ts). If a conversation + a recent
  // outbound Message row exist, update its deliveryStatus. This is usually a
  // no-op for WhatsApp messages (they live in the sidecar's in-memory store,
  // not the DB), but covers activity messages + future WhatsApp persistence.
  let updatedMessageId: string | null = null;
  try {
    const conversation = await db.conversation.findFirst({
      where: { channel: "whatsapp", sourceId: input.jid },
      select: { id: true },
    });
    if (conversation) {
      // Find the most recent outbound Message in "sending" or "sent" state
      // within the last 10 minutes. A message in "sending" that gets a
      // failure update is the one that failed. The 10-min window bounds the
      // search; the deliveryStatus filter prevents overwriting an already-
      // terminal status (read/failed).
      const tenMinAgo = new Date(Date.now() - 10 * 60_000);
      const message = await db.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: "outbound",
          deliveryStatus: { in: ["sending", "sent"] },
          timestamp: { gte: tenMinAgo },
        },
        orderBy: { timestamp: "desc" },
        select: { id: true },
      });
      if (message) {
        await db.message.update({
          where: { id: message.id },
          data: { deliveryStatus: input.deliveryStatus },
        });
        updatedMessageId = message.id;
      }
    }
  } catch {
    // DB not ready / table doesn't exist — non-fatal. The audit log below
    // is the primary persistence mechanism.
  }

  // ── Always log failures to the audit log (durable record) ──────────────
  // This is the PRIMARY persistence: even if no Message row was updated,
  // the failure is recorded here with the waMessageId for traceability.
  // A future "failed messages" inbox indicator can query for
  // action="whatsapp.message.failed" entries.
  if (isFailure) {
    await logAudit({
      action: "whatsapp.message.failed",
      entity: "conversation",
      entityId: updatedMessageId ?? undefined,
      actor: "system",
      metadata: {
        waMessageId: input.waMessageId,
        jid: input.jid,
        phone,
        deliveryStatus: input.deliveryStatus,
        error: input.error ?? null,
        messageRowUpdated: updatedMessageId !== null,
      },
    });
  } else if (updatedMessageId) {
    // Non-failure status update (sent/delivered/read) — log only if we
    // actually updated a Message row (keeps the audit log focused; pure
    // status changes without a DB row aren't actionable).
    await logAudit({
      action: "whatsapp.message.status_changed",
      entity: "message",
      entityId: updatedMessageId,
      actor: "system",
      metadata: {
        waMessageId: input.waMessageId,
        jid: input.jid,
        phone,
        deliveryStatus: input.deliveryStatus,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    persisted: updatedMessageId !== null,
    audited: isFailure || updatedMessageId !== null,
  });
}, "POST /api/whatsapp/message-status");
