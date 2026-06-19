import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { phoneFromJid, isGroupJid } from "@/lib/channels/evolution-api";
import { dispatch } from "@/lib/agents/orchestrator";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { evolutionWebhookSchema, timingSafeEqual } from "@/lib/validation";

/**
 * Structured logger — no full error objects leaked to stdout in production.
 * Use `level: "error"` for errors, `level: "warn"` for policy violations,
 * `level: "info"` for successful events.
 */
function webhookLog(
  level: "error" | "warn" | "info",
  action: string,
  meta?: Record<string, unknown>,
) {
  console.log(JSON.stringify({ type: "webhook", level, action, ...meta }));
}

/**
 * Evolution API Webhook Handler
 *
 * Receives events from Evolution API and processes them:
 * - MESSAGES_UPSERT → new incoming/outgoing message
 * - CONNECTION_UPDATE → WhatsApp connection status change
 * - QRCODE_UPDATED → new QR code generated
 */

export async function POST(req: NextRequest) {
  try {
    // S5 fix: Verify the webhook secret BEFORE parsing the JSON body.
    // Parsing JSON is expensive — doing it before auth allows unauthenticated
    // attackers to force expensive JSON parsing (cheap DoS amplifier).
    // The secret is sent in a header (not computed from the body), so it can
    // be verified without reading the body first.

    // Fail closed: require the secret to be configured AND the signature to match.
    // If the env var is missing, reject all requests rather than accepting them.
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (!webhookSecret) {
      webhookLog("error", "evolution_webhook_secret_not_configured");
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }
    const signature =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-hub-signature") ||
      "";
    if (!timingSafeEqual(signature, webhookSecret)) {
      webhookLog("warn", "invalid_webhook_secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      webhookLog("error", "missing_service_role_key");
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 500 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Only parse the body after the secret has been verified.
    const body = await req.json();

    const parsed = evolutionWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const event = parsed.data.event.toLowerCase();
    const instanceName = parsed.data.instance;

    // Rate limiting — 60 requests per minute per instance
    const rl = await rateLimit(`evo:${instanceName}`, 60, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // Find the channel for this instance
    const { data: channel } = await supabase
      .from("channels")
      .select("id, seller_id")
      .eq("name", instanceName)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    if (!channel) {
      webhookLog("info", "no_channel", { instance: instanceName });
      return NextResponse.json({ ok: true, skipped: true });
    }

    switch (event) {
      case "messages.upsert":
        await handleMessageUpsert(
          supabase,
          body.data,
          channel.id,
          channel.seller_id,
          instanceName,
        );
        break;

      case "connection.update":
        await handleConnectionUpdate(supabase, body.data, channel.id);
        break;

      case "qrcode.updated":
        // QR code updates are polled from the client, no DB action needed
        break;

      default:
        webhookLog("info", "unhandled_event", {
          event,
          instance: instanceName,
        });
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    webhookLog("error", "top_level_error", { error: message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ── Message Handler ── */

async function handleMessageUpsert(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  data: Record<string, unknown>,
  channelId: string,
  sellerId: string,
  instanceName: string,
) {
  let messages: Array<Record<string, unknown>> = [];
  if (Array.isArray(data)) {
    messages = data;
  } else if (Array.isArray(data.messages)) {
    messages = data.messages as Array<Record<string, unknown>>;
  } else if (data.key && data.message) {
    messages = [data];
  } else if (data.message && (data.message as Record<string, unknown>).key) {
    messages = [data.message as Record<string, unknown>];
  } else {
    messages = [data];
  }

  for (const msg of messages) {
    const key = msg.key as Record<string, unknown> | undefined;
    if (!key) continue;

    const remoteJid = key.remoteJid as string;
    if (!remoteJid || isGroupJid(remoteJid)) continue;

    const fromMe = key.fromMe as boolean;
    const phone = phoneFromJid(remoteJid);
    const messageId = key.id as string;
    const pushName = msg.pushName as string | undefined;

    const msgContent = msg.message as Record<string, unknown> | undefined;
    if (!msgContent) continue;

    let content = "";
    let contentType: "text" | "image" | "audio" | "video" | "file" = "text";
    let mediaUrl: string | null = null;

    if (msgContent.conversation) {
      content = msgContent.conversation as string;
    } else if (msgContent.extendedTextMessage) {
      content = (msgContent.extendedTextMessage as Record<string, unknown>)
        .text as string;
    } else if (msgContent.imageMessage) {
      contentType = "image";
      content =
        ((msgContent.imageMessage as Record<string, unknown>)
          .caption as string) || "";
      mediaUrl =
        ((msgContent.imageMessage as Record<string, unknown>).url as string) ||
        null;
    } else if (msgContent.audioMessage) {
      contentType = "audio";
      content = "[Voice Message]";
    } else if (msgContent.videoMessage) {
      contentType = "video";
      content =
        ((msgContent.videoMessage as Record<string, unknown>)
          .caption as string) || "";
    } else if (msgContent.documentMessage) {
      contentType = "file";
      content =
        ((msgContent.documentMessage as Record<string, unknown>)
          .fileName as string) || "[Document]";
    } else {
      continue;
    }

    let conversationId: string;

    const { data: existingConvo } = await supabase
      .from("conversations")
      .select("id")
      .eq("channel_id", channelId)
      .eq("platform_thread_id", remoteJid)
      .limit(1)
      .single();

    if (existingConvo) {
      conversationId = existingConvo.id;
    } else {
      // Step 1: Atomically UPSERT the customer to resolve the race condition
      const { data: customerData, error: custError } = await supabase
        .from("customers")
        .upsert(
          {
            seller_id: sellerId,
            name: pushName || phone,
            phone,
          },
          { onConflict: "seller_id,phone" },
        )
        .select("id")
        .single();

      if (custError) {
        webhookLog("warn", "customer_upsert_failed", {
          error: custError.message,
        });
      }

      // Step 2: Create the conversation properly linked to the customer
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({
          seller_id: sellerId,
          channel_id: channelId,
          customer_id: customerData?.id || null,
          platform_thread_id: remoteJid,
          status: "open",
          unread_count: fromMe ? 0 : 1,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!newConvo) {
        // Concurrent insert race — fall back to querying the existing row
        const { data: racedConvo } = await supabase
          .from("conversations")
          .select("id")
          .eq("channel_id", channelId)
          .eq("platform_thread_id", remoteJid)
          .limit(1)
          .single();
        if (!racedConvo) continue;
        conversationId = racedConvo.id;
      } else {
        conversationId = newConvo.id;
      }
    }

    if (messageId) {
      const { data: existingMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("platform_message_id", messageId)
        .limit(1)
        .single();

      if (existingMsg) {
        webhookLog("info", "skip_duplicate", {
          instance: instanceName,
          messageId,
          conversationId,
        });
        continue;
      }
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: fromMe ? "outbound" : "inbound",
      content,
      content_type: contentType,
      media_url: mediaUrl,
      is_ai_reply: false,
      platform_message_id: messageId || null,
    });

    webhookLog("info", "message_saved", {
      instance: instanceName,
      messageId,
      direction: fromMe ? "outbound" : "inbound",
      contentType,
      conversationId,
    });

    const updates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: content ? content.substring(0, 80) : "",
    };

    if (!fromMe) {
      const { data: convo } = await supabase
        .from("conversations")
        .select("unread_count")
        .eq("id", conversationId)
        .single();

      updates.unread_count = (convo?.unread_count || 0) + 1;
      updates.status = "open";
    }

    await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId);

    if (!fromMe) {
      try {
        await dispatch({ type: "message.received", conversationId, sellerId });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        webhookLog("warn", "orchestrator_retry", { error: errMsg });
        const idempotencyKey = messageId
          ? `msg:${messageId}`
          : `conv:${conversationId}:${Date.now()}`;
        try {
          await supabase.from("webhook_retry_queue").insert({
            idempotency_key: idempotencyKey,
            event_type: "message.received",
            payload: { conversationId, sellerId, platformMessageId: messageId },
            seller_id: sellerId,
          });
        } catch (insertErr: unknown) {
          const msg =
            insertErr instanceof Error
              ? insertErr.message
              : "Unknown insert error";
          if (!msg.includes("duplicate") && !msg.includes("unique")) {
            webhookLog("warn", "retry_queue_insert_failed", { error: msg });
          }
        }
      }
    }
  }
}

/* ── Connection Handler ── */

async function handleConnectionUpdate(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  data: Record<string, unknown>,
  channelId: string,
) {
  const state = data.state as string | undefined;
  if (!state) return;

  const isConnected = state === "open";

  const { data: channelData } = await supabase
    .from("channels")
    .select("credentials")
    .eq("id", channelId)
    .single();

  const currentCredentials =
    (channelData?.credentials as Record<string, unknown>) || {};

  await supabase
    .from("channels")
    .update({
      active: isConnected,
      credentials: {
        ...currentCredentials,
        status: state,
        updatedAt: new Date().toISOString(),
      },
    })
    .eq("id", channelId);
}
