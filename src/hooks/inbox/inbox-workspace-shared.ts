"use client";

/**
 * INB-27 — shared pure layer for the Inbox workspace hook family.
 *
 * Everything here is module-level truth with no React state: bounded
 * constants, wire types, media-send specs and pure projection helpers.
 * The behavioral hooks live beside this file
 * (`use-inbox-chat-queue.ts`, `use-inbox-thread.ts`, `use-inbox-drafts.ts`,
 * `use-inbox-outbox.ts`, `use-inbox-transport.ts`) and are composed by
 * `src/hooks/use-inbox-workspace.ts`, which keeps the exact historical
 * return shape so no component consumer changes.
 */

import type {
  InboxChat,
  InboxMessage,
} from "@/components/inbox/inbox-workspace-types";
import type { ConversationWorkflowState } from "@/components/inbox/conversation-controls";
import type { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import {
  type IncomingMessage,
  type WhatsAppStatus,
} from "@/lib/whatsapp/types";
import { mapBaileysStatusUpdate } from "../../../sidecars/whatsapp/delivery-status";

export const CHAT_REFRESH_COALESCE_MS = 500;
export const LIVE_RECOVERY_POLL_MS = 3_000;
export const DRAFT_SAVE_DELAY_MS = 600;
export const DRAFT_LOAD_ATTEMPTS = 3;
export const DRAFT_LOAD_RETRY_MS = 500;
export const DRAFT_WRITE_ATTEMPTS = 3;
const MAX_DEEP_LINK_ID_LENGTH = 160;

export type MediaSendResponse = {
  ok: boolean;
  accepted?: boolean;
  id?: string | null;
  effectKey?: string;
  state?: InboxMessage["outboxState"];
  requiresDuplicateConfirmation?: boolean;
};

/** The localized workspace copy accessor produced by the workspace hook. */
export type InboxWorkspaceCopy = (
  key: Parameters<typeof getInboxWorkspaceCopy>[1],
  params?: Record<string, string | number>,
) => string;

/**
 * Truthful outcome for permanent multi-select chat deletion. `errorCode`
 * carries the server's coded rejection (LICENSE_*, VALIDATION_ERROR, …) or an
 * `HTTP_<status>` fallback and `errorDetail` carries the server's human-readable
 * `error` message, so the confirm dialog can show the operator why the store
 * refused the deletion instead of a bare status the operator cannot act on
 * (campaign row B5 round 2: "could not be deleted (HTTP_400)" with the server's
 * actual reason discarded made every rejection a dead end).
 *
 * Round 3: `rejectionSummary` carries the server's PII-free shape verdict
 * (failing schema paths, id count/lengths, body size) — the installed
 * runtime's logs are unreachable by design, so the dialog itself must name
 * the exact failing condition for the next campaign observation.
 */
export interface DeleteChatsOutcome {
  ok: boolean;
  errorCode: string | null;
  errorDetail: string | null;
  rejectionSummary: string | null;
  /** Audit S3-20: ids that matched nothing (foreign shop, typo) — null when unknown. */
  notFoundIds: string[] | null;
}

/** Server 400 shape from POST /api/whatsapp/chats/delete (B5 round 3). */
export interface DeleteChatsRejection {
  reason: string;
  issues?: string[];
  idCount?: number;
  idLengths?: number[];
  bodyLength?: number;
}

export const DELETE_CONTRACT_MAX_IDS = 100;
// Must mirror the server route's zod bound exactly. 256 — not the cuid-length
// guess (64): the Internal.33 installed campaign reproduced a legitimate
// 69-char conversation id (legacy/provider-shaped) that the 64 bound turned
// into a permanent, undeletable chat (founder finding F-04). The projection's
// id space is the authority.
export const DELETE_CONTRACT_MAX_ID_LENGTH = 256;

/**
 * Compact PII-free diagnostic summary of a delete rejection. Never includes
 * id values — only shapes, lengths and schema paths.
 */
export function describeDeleteRejection(
  rejection: DeleteChatsRejection | null | undefined,
): string | null {
  if (!rejection) return null;
  if (rejection.reason === "malformed_json") {
    return `malformed JSON body (${rejection.bodyLength ?? 0} bytes)`;
  }
  const parts: string[] = [];
  if (rejection.issues && rejection.issues.length > 0) {
    parts.push(`failing: ${rejection.issues.join(", ")}`);
  }
  if (typeof rejection.idCount === "number" && rejection.idCount >= 0) {
    parts.push(`${rejection.idCount} id(s)`);
  }
  if (rejection.idLengths && rejection.idLengths.length > 0) {
    parts.push(`lengths [${rejection.idLengths.join(", ")}]`);
  }
  if (typeof rejection.bodyLength === "number") {
    parts.push(`body ${rejection.bodyLength}B`);
  }
  return parts.length > 0 ? parts.join(" — ") : rejection.reason;
}

/**
 * Upload one bounded multipart media send with truthful byte progress and a
 * registered pre-response abort handle (#317 upload progress/cancellation).
 * The abort is only honoured while the browser request is in flight: once the
 * final byte is written the durable queue may already be committing, so the
 * caller flips its cancellable flag off at 100%.
 */
export function postFormWithUploadProgress(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
  registerCancel: (abort: () => void) => void,
): Promise<{ status: number; data: MediaSendResponse }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      try {
        const data = (xhr.responseText ? JSON.parse(xhr.responseText) : {}) as MediaSendResponse;
        resolve({ status: xhr.status, data });
      } catch {
        reject(new Error("invalid-media-send-response"));
      }
    };
    xhr.onerror = () => reject(new TypeError("media-send-network-error"));
    xhr.onabort = () => reject(new DOMException("media-send-aborted", "AbortError"));
    xhr.ontimeout = () => reject(new TypeError("media-send-timeout"));
    registerCancel(() => xhr.abort());
    xhr.send(form);
  });
}

const MAX_OUTBOUND_IMAGE_BYTES = 20 * 1024 * 1024;
const SAFE_OUTBOUND_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_OUTBOUND_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_OUTBOUND_DOCUMENT_BYTES = 64 * 1024 * 1024;
const SAFE_OUTBOUND_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
]);
// Outbound voice shares the 32 MiB encrypted-storage audio ceiling. The
// PTT voice-note form is decided from authenticated content on the server,
// never from the browser declaration.
const MAX_OUTBOUND_VOICE_BYTES = 32 * 1024 * 1024;
const SAFE_OUTBOUND_VOICE_TYPES = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
]);

export interface CanonicalChatResponse {
  chats: Array<{
    jid: string;
    conversationId: string;
    name: string;
    phone: string | null;
    unread: number;
    states?: { pinned: boolean; muted: boolean; archived: boolean };
    lastMessage?: {
      text: string;
      timestamp: number;
      fromMe: boolean;
      type?: string | null;
    };
    workflow: {
      status: string;
      assigneeId: string | null;
      assignmentVersion: number;
      priority: string | null;
      labels: string[];
      snoozedUntil: string | null;
      waitingSince: string | null;
      firstReplyAt: string | null;
    };
  }>;
  sidecarReachable: boolean;
  sidecarStatus: string | null;
  authority?: { allowedActions: string[] };
}

export interface ConversationProjection {
  id: string;
  channel: string;
  contactName: string | null;
  contactPhone: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  status: string;
  assigneeId: string | null;
  priority: string | null;
  labels: string | null;
  snoozedUntil: string | null;
  waitingSince: string | null;
  firstReplyAt: string | null;
}

export interface SeededMessage {
  id: string;
  body: string;
  direction: string;
  timestamp: string;
  messageType?: string;
  attachment?: IncomingMessage["attachment"];
}

export function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "qr" ||
    value === "connected"
  );
}

function parseLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function normalizeDeepLinkConversationId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > MAX_DEEP_LINK_ID_LENGTH) return null;
  return normalized;
}

export function mapConversationProjection(
  conversation: ConversationProjection,
  restrictedContact: string,
): InboxChat {
  return {
    id: conversation.id,
    conversationId: conversation.id,
    name: conversation.contactName ?? restrictedContact,
    phone: conversation.contactPhone ?? undefined,
    channel: "conversation",
    lastMessageAt: conversation.lastMessageAt
      ? new Date(conversation.lastMessageAt).getTime()
      : undefined,
    unread: conversation.unreadCount,
    pinned: false,
    muted: false,
    archived: false,
    workflow: {
      status: conversation.status as ConversationWorkflowState["status"],
      assigneeId: conversation.assigneeId,
      priority: conversation.priority as ConversationWorkflowState["priority"],
      labels: parseLabels(conversation.labels),
      snoozedUntil: conversation.snoozedUntil,
      waitingSince: conversation.waitingSince,
      firstReplyAt: conversation.firstReplyAt,
    },
  };
}

export function mapDeliveryStatus(
  update: Record<string, unknown>,
): InboxMessage["deliveryStatus"] | null {
  // Canonical enum-truthful projection (sidecars/whatsapp/delivery-status.ts):
  // SERVER_ACK→sent, DELIVERY_ACK→delivered, ERROR→failed, PLAYED→read.
  return mapBaileysStatusUpdate(update);
}

export function inboxMessagesEqual(
  left: readonly InboxMessage[],
  right: readonly InboxMessage[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((message, index) => {
    const candidate = right[index];
    if (candidate === undefined) return false;
    // Same attachment object, or two distinct-but-equal attachments. Plain
    // messages (no attachment) compare equal here, so the memo comparator
    // stays effective for the common text-only case.
    const attachmentsEqual =
      message.attachment === candidate.attachment ||
      (message.attachment !== undefined &&
        candidate.attachment !== undefined &&
        JSON.stringify(message.attachment) ===
          JSON.stringify(candidate.attachment));
    return (
      message.id === candidate.id &&
      message.body === candidate.body &&
      message.direction === candidate.direction &&
      message.timestamp === candidate.timestamp &&
      message.messageType === candidate.messageType &&
      message.deliveryStatus === candidate.deliveryStatus &&
      message.outboxEffectKey === candidate.outboxEffectKey &&
      message.outboxState === candidate.outboxState &&
      attachmentsEqual
    );
  });
}

/**
 * Ledger INB-28 — the per-media spec table. Guards keep the exact
 * authenticated type gates the route contracts pin; the four former
 * duplicated senders share one factory through these specs.
 */
export type MediaSendSpec = {
  kind: "image" | "video" | "document" | "audio";
  endpoint:
    | "/api/whatsapp/send-image"
    | "/api/whatsapp/send-video"
    | "/api/whatsapp/send-document"
    | "/api/whatsapp/send-voice";
  fieldName: string;
  fallbackFileName: string;
  maxBytes: number;
  rejects: (mediaType: string) => boolean;
  /** WhatsApp carries the composer caption for media; audio never does. */
  carriesCaption: boolean;
};

export const MEDIA_SEND_SPECS = {
  image: {
    kind: "image",
    endpoint: "/api/whatsapp/send-image",
    fieldName: "image",
    fallbackFileName: "image",
    maxBytes: MAX_OUTBOUND_IMAGE_BYTES,
    rejects: (mediaType: string) => !SAFE_OUTBOUND_IMAGE_TYPES.has(mediaType),
    carriesCaption: true,
  },
  video: {
    kind: "video",
    endpoint: "/api/whatsapp/send-video",
    fieldName: "video",
    fallbackFileName: "video.mp4",
    maxBytes: MAX_OUTBOUND_VIDEO_BYTES,
    rejects: (mediaType: string) => mediaType !== "video/mp4",
    carriesCaption: true,
  },
  document: {
    kind: "document",
    endpoint: "/api/whatsapp/send-document",
    fieldName: "document",
    fallbackFileName: "document",
    maxBytes: MAX_OUTBOUND_DOCUMENT_BYTES,
    rejects: (mediaType: string) => !SAFE_OUTBOUND_DOCUMENT_TYPES.has(mediaType),
    carriesCaption: true,
  },
  voice: {
    kind: "audio",
    endpoint: "/api/whatsapp/send-voice",
    fieldName: "audio",
    fallbackFileName: "audio",
    maxBytes: MAX_OUTBOUND_VOICE_BYTES,
    rejects: (mediaType: string) => !SAFE_OUTBOUND_VOICE_TYPES.has(mediaType),
    carriesCaption: false,
  },
} as const satisfies Record<string, MediaSendSpec>;
