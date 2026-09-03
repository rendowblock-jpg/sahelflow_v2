"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  InboxChat,
  InboxMessage,
  InboxQueueFilter,
  InboxTransportState,
  InboxUploadState,
} from "@/components/inbox/inbox-workspace-types";
import type { ConversationWorkflowState } from "@/components/inbox/conversation-controls";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import {
  mergeInboxMessageProjection,
  reconcileInboxProviderMessage,
  toInboxMessageFromWhatsApp,
} from "@/lib/inbox/message-projection";
import { toast } from "@/lib/toast";
import { mapBaileysStatusUpdate } from "../../sidecars/whatsapp/delivery-status";
import {
  messageText,
  type IncomingMessage,
  type WhatsAppStatus,
  type WhatsAppUser,
} from "@/lib/whatsapp/types";
import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";

const CHAT_REFRESH_COALESCE_MS = 500;
const LIVE_RECOVERY_POLL_MS = 3_000;
const DRAFT_SAVE_DELAY_MS = 600;
const DRAFT_LOAD_ATTEMPTS = 3;
const DRAFT_LOAD_RETRY_MS = 500;
const DRAFT_WRITE_ATTEMPTS = 3;
const MAX_DEEP_LINK_ID_LENGTH = 160;

type MediaSendResponse = {
  ok: boolean;
  accepted?: boolean;
  id?: string | null;
  effectKey?: string;
  state?: InboxMessage["outboxState"];
  requiresDuplicateConfirmation?: boolean;
};

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

const DELETE_CONTRACT_MAX_IDS = 100;
// Must mirror the server route's zod bound exactly. 256 — not the cuid-length
// guess (64): the Internal.33 installed campaign reproduced a legitimate
// 69-char conversation id (legacy/provider-shaped) that the 64 bound turned
// into a permanent, undeletable chat (founder finding F-04). The projection's
// id space is the authority.
const DELETE_CONTRACT_MAX_ID_LENGTH = 256;

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
function postFormWithUploadProgress(
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

interface CanonicalChatResponse {
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

interface ConversationProjection {
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

interface SeededMessage {
  id: string;
  body: string;
  direction: string;
  timestamp: string;
  messageType?: string;
  attachment?: IncomingMessage["attachment"];
}

function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
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

function normalizeDeepLinkConversationId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > MAX_DEEP_LINK_ID_LENGTH) return null;
  return normalized;
}

function mapConversationProjection(
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

function mapDeliveryStatus(
  update: Record<string, unknown>,
): InboxMessage["deliveryStatus"] | null {
  // Canonical enum-truthful projection (sidecars/whatsapp/delivery-status.ts):
  // SERVER_ACK→sent, DELIVERY_ACK→delivered, ERROR→failed, PLAYED→read.
  return mapBaileysStatusUpdate(update);
}

function inboxMessagesEqual(
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
type MediaSendSpec = {
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

const MEDIA_SEND_SPECS = {
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

export function useInboxWorkspace() {
  const searchParams = useSearchParams();
  const requestedConversationId = normalizeDeepLinkConversationId(
    searchParams.get("conversation"),
  );
  const { t, locale } = useI18n();
  const copy = useCallback(
    (key: Parameters<typeof getInboxWorkspaceCopy>[1], params?: Record<string, string | number>) =>
      getInboxWorkspaceCopy(locale, key, params),
    [locale],
  );

  const [chats, setChats] = useState<InboxChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Ledger INB-11: honest older-history paging. The cursor is the opaque
  // (timestampSeconds,rowId) composite served by the messages route; null
  // means the locally loaded thread has reached its durable beginning.
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  // Ledger INB-29: ambiguous retry is a real decision — it uses an
  // accessible AlertDialog instead of window.confirm.
  const [ambiguousRetryMessage, setAmbiguousRetryMessage] =
    useState<InboxMessage | null>(null);
  const ambiguousRetryResolveRef = useRef<((confirmed: boolean) => void) | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<InboxQueueFilter>("all");
  const [allowedActions, setAllowedActions] = useState<string[]>([]);
  const [sidecarReachable, setSidecarReachable] = useState<boolean | null>(null);
  const [sidecarStatus, setSidecarStatus] = useState<WhatsAppStatus | null>(null);
  const [dataDegraded, setDataDegraded] = useState(false);
  const [replyText, setReplyTextState] = useState("");
  // Session-scoped draft previews per conversation ("Draft:" in queue rows).
  // Server drafts remain authoritative; this mirrors what the operator has
  // typed (or what loaded) so indicators survive conversation switches.
  const [localDrafts, setLocalDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<string, InboxUploadState>>({});
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [qrKey, setQrKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesInnerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  // Scroll-to-latest affordance state (WhatsApp-class tail management):
  // distance-from-bottom drives the FAB; messages arriving while the operator
  // is scrolled up accumulate into the missed count instead of yanking the
  // viewport (Signal-style auto-scroll is a documented anti-pattern).
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [missedMessageCount, setMissedMessageCount] = useState(0);
  // Unread-at-open snapshot: captured in selectChat BEFORE any mark-read
  // round-trip, drives the "New messages" divider and the open-at-first-unread
  // anchor. Dismissed explicitly (divider click) or on the next selection.
  const [activeChatInitialUnread, setActiveChatInitialUnread] = useState(0);
  const activeChatInitialUnreadRef = useRef(0);
  const initialUnreadScrollDoneRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const activeTransportIdRef = useRef<string | null>(null);
  const chatRefreshTimerRef = useRef<number | null>(null);
  const chatLoadGenerationRef = useRef(0);
  const activeChatRef = useRef<InboxChat | null>(null);
  const messagesRef = useRef<InboxMessage[]>([]);
  const foregroundMessageLoadRef = useRef(0);
  const messageLoadGenerationRef = useRef(0);
  const messageSelectionGenerationRef = useRef(0);
  const messageMutationGenerationRef = useRef(0);
  const readStateWriteQueueRef = useRef(new Map<string, Promise<void>>());
  const explicitUnreadHoldRef = useRef(new Set<string>());
  const sendingRef = useRef(false);
  const deepLinkAttemptRef = useRef<string | null>(null);
  const pinnedDeepLinkChatRef = useRef<InboxChat | null>(null);
  const replyTextRef = useRef("");
  const draftEditGenerationRef = useRef(0);
  const draftLoadGenerationRef = useRef(0);
  const draftReadyConversationRef = useRef<string | null>(null);
  const draftWriteQueueRef = useRef(new Map<string, Promise<boolean>>());
  const draftRevisionRef = useRef(new Map<string, number>());
  const uploadCancelRef = useRef(new Map<string, () => void>());

  const markUploadProgress = useCallback(
    (messageId: string, progress: number) => {
      setUploads((current) => ({
        ...current,
        [messageId]: { progress, cancellable: progress < 100 },
      }));
    },
    [],
  );

  const clearUploadState = useCallback((messageId: string) => {
    uploadCancelRef.current.delete(messageId);
    setUploads((current) => {
      if (!(messageId in current)) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }, []);

  const cancelUpload = useCallback(
    (messageId: string) => {
      const abort = uploadCancelRef.current.get(messageId);
      if (abort) abort();
    },
    [],
  );

  const setReplyText = useCallback(
    (value: string | ((current: string) => string)) => {
      const resolved =
        typeof value === "function" ? value(replyTextRef.current) : value;
      draftEditGenerationRef.current += 1;
      replyTextRef.current = resolved;
      setReplyTextState(resolved);
      // Track the row-level draft indicator against the conversation whose
      // draft layer is currently live (null during switches → no misattribution).
      const conversationId = draftReadyConversationRef.current;
      if (!conversationId) return;
      setLocalDrafts((drafts) => {
        const next = { ...drafts };
        if (resolved.trim()) next[conversationId] = resolved;
        else delete next[conversationId];
        return next;
      });
    },
    [],
  );

  const replaceMessages = useCallback((next: InboxMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const mutateMessages = useCallback(
    (
      conversationId: string,
      mutation: (current: InboxMessage[]) => InboxMessage[],
    ) => {
      if (activeChatRef.current?.conversationId !== conversationId) return;
      const current = messagesRef.current;
      const next = mutation(current);
      if (inboxMessagesEqual(current, next)) return;
      if (activeChatRef.current?.conversationId !== conversationId) return;
      messageMutationGenerationRef.current += 1;
      messagesRef.current = next;
      setMessages(next);
    },
    [],
  );

  const canUpdateConversation = allowedActions.includes("conversations.update");
  const canReply = allowedActions.includes("conversations.reply");
  const canDeleteChats = allowedActions.includes("conversations.delete");
  const canManageWhatsApp = allowedActions.includes("whatsapp.connection.manage");

  const mergePinnedDeepLink = useCallback((nextChats: InboxChat[]) => {
    const pinned = pinnedDeepLinkChatRef.current;
    if (!pinned) return nextChats;
    if (
      nextChats.some(
        (chat) => chat.conversationId === pinned.conversationId,
      )
    ) {
      pinnedDeepLinkChatRef.current = null;
      return nextChats;
    }
    return [pinned, ...nextChats];
  }, []);

  const loadFallbackProjection = useCallback(async (loadGeneration: number) => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error(`Conversation projection failed: ${response.status}`);
    const data = (await response.json()) as {
      conversations: ConversationProjection[];
      authority?: { allowedActions: string[] };
    };
    if (chatLoadGenerationRef.current !== loadGeneration) return;
    setAllowedActions(data.authority?.allowedActions ?? []);
    const restrictedContact = copy("restrictedContact");
    const nextChats = mergePinnedDeepLink(
      data.conversations.map((conversation) =>
        mapConversationProjection(conversation, restrictedContact),
      ),
    );
    const activeChat = activeChatRef.current;
    if (activeChat) {
      activeChatRef.current =
        nextChats.find(
          (chat) => chat.conversationId === activeChat.conversationId,
        ) ?? activeChat;
    }
    setChats(nextChats);
  }, [copy, mergePinnedDeepLink]);

  const loadChats = useCallback(async () => {
    const loadGeneration = ++chatLoadGenerationRef.current;
    const isLatestChatLoad = () =>
      chatLoadGenerationRef.current === loadGeneration;
    try {
      const response = await fetch("/api/whatsapp/chats?limit=100", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as CanonicalChatResponse;
        if (!isLatestChatLoad()) return;
        setAllowedActions(data.authority?.allowedActions ?? []);
        setSidecarReachable(data.sidecarReachable);
        setSidecarStatus(
          isWhatsAppStatus(data.sidecarStatus) ? data.sidecarStatus : null,
        );
        setDataDegraded(false);
        const nextChats = mergePinnedDeepLink(
          data.chats.map((chat) => ({
            id: chat.jid,
            conversationId: chat.conversationId,
            transportId: chat.jid,
            name: chat.name,
            phone: chat.phone ?? undefined,
            channel: "whatsapp" as const,
            lastMessageText: chat.lastMessage?.text,
            lastMessageAt: chat.lastMessage
              ? chat.lastMessage.timestamp * 1000
              : undefined,
            lastMessageFromMe: chat.lastMessage?.fromMe,
            lastMessageType: chat.lastMessage?.type ?? undefined,
            unread: chat.unread,
            pinned: chat.states?.pinned ?? false,
            muted: chat.states?.muted ?? false,
            archived: chat.states?.archived ?? false,
            workflow: {
              status:
                chat.workflow.status as ConversationWorkflowState["status"],
              assigneeId: chat.workflow.assigneeId,
              assignmentVersion: chat.workflow.assignmentVersion,
              priority:
                chat.workflow.priority as ConversationWorkflowState["priority"],
              labels: chat.workflow.labels,
              snoozedUntil: chat.workflow.snoozedUntil,
              waitingSince: chat.workflow.waitingSince,
              firstReplyAt: chat.workflow.firstReplyAt,
            },
          })),
        );
        const activeChat = activeChatRef.current;
        if (activeChat) {
          activeChatRef.current =
            nextChats.find(
              (chat) => chat.conversationId === activeChat.conversationId,
            ) ?? activeChat;
        }
        setChats(nextChats);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        if (!isLatestChatLoad()) return;
        setSidecarReachable(null);
        setSidecarStatus(null);
        setDataDegraded(false);
        await loadFallbackProjection(loadGeneration);
        return;
      }

      throw new Error(`Canonical inbox load failed: ${response.status}`);
    } catch {
      if (!isLatestChatLoad()) return;
      setDataDegraded(true);
      try {
        await loadFallbackProjection(loadGeneration);
      } catch {
        if (isLatestChatLoad()) setChats([]);
      }
    } finally {
      if (isLatestChatLoad()) setLoadingChats(false);
    }
  }, [loadFallbackProjection, mergePinnedDeepLink]);

  const scheduleChatsRefresh = useCallback(() => {
    if (chatRefreshTimerRef.current !== null) return;
    chatRefreshTimerRef.current = window.setTimeout(() => {
      chatRefreshTimerRef.current = null;
      void loadChats();
    }, CHAT_REFRESH_COALESCE_MS);
  }, [loadChats]);

  const markRead = useCallback(
    async (chat: InboxChat) => {
      const conversationId = chat.conversationId;
      if (
        !canUpdateConversation ||
        chat.unread <= 0 ||
        explicitUnreadHoldRef.current.has(conversationId)
      ) {
        return;
      }
      const previous =
        readStateWriteQueueRef.current.get(conversationId) ?? Promise.resolve();
      const write = previous.catch(() => undefined).then(async () => {
        if (explicitUnreadHoldRef.current.has(conversationId)) return;
        try {
          const response = await fetch(
            `/api/conversations/${encodeURIComponent(conversationId)}/read`,
            { method: "PATCH" },
          );
          if (!response.ok) return;
          setChats((current) =>
            current.map((entry) =>
              entry.id === chat.id ? { ...entry, unread: 0 } : entry,
            ),
          );
        } catch {
        }
      });
      readStateWriteQueueRef.current.set(conversationId, write);
      try {
        await write;
      } finally {
        if (readStateWriteQueueRef.current.get(conversationId) === write) {
          readStateWriteQueueRef.current.delete(conversationId);
        }
      }
    },
    [canUpdateConversation],
  );

  const markUnread = useCallback(async (chat: InboxChat) => {
    if (!canUpdateConversation) return false;
    const conversationId = chat.conversationId;
    explicitUnreadHoldRef.current.add(conversationId);
    messageLoadGenerationRef.current += 1;
    chatLoadGenerationRef.current += 1;
    try {
      await readStateWriteQueueRef.current
        .get(conversationId)
        ?.catch(() => undefined);
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/unread`,
        { method: "PATCH" },
      );
      if (!response.ok) {
        explicitUnreadHoldRef.current.delete(conversationId);
        return false;
      }
      chatLoadGenerationRef.current += 1;
      setChats((current) =>
        current.map((entry) =>
          entry.conversationId === conversationId
            ? { ...entry, unread: Math.max(1, entry.unread) }
            : entry,
        ),
      );
      return true;
    } catch {
      explicitUnreadHoldRef.current.delete(conversationId);
      return false;
    }
  }, [canUpdateConversation]);

  const loadMessages = useCallback(
    async (chat: InboxChat, options?: { background?: boolean }) => {
      const background = options?.background === true;
      const requestedConversationId = chat.conversationId;
      const messageLoadGeneration = ++messageLoadGenerationRef.current;
      const foregroundLoad = background
        ? null
        : ++foregroundMessageLoadRef.current;
      const selectionGeneration = messageSelectionGenerationRef.current;
      const mutationGeneration = messageMutationGenerationRef.current;
      const isCurrentConversation = () =>
        activeChatRef.current?.conversationId === requestedConversationId;
      const canApplyLoadedProjection = () =>
        isCurrentConversation() &&
        messageLoadGenerationRef.current === messageLoadGeneration &&
        messageSelectionGenerationRef.current === selectionGeneration;
      const applyLoadedProjection = (loaded: InboxMessage[]) => {
        if (!canApplyLoadedProjection()) return false;
        replaceMessages(
          messageMutationGenerationRef.current === mutationGeneration
            ? loaded
            : mergeInboxMessageProjection(loaded, messagesRef.current),
        );
        return true;
      };
      if (!background) {
        setLoadingMessages(true);
        setSendError(null);
      }
      try {
        if (chat.channel === "whatsapp" && chat.transportId) {
          const response = await fetch(
            `/api/whatsapp/chats/${encodeURIComponent(chat.transportId)}/messages?limit=200`,
            { cache: "no-store" },
          );
          if (response.ok) {
            const data = (await response.json()) as {
              messages: Array<IncomingMessage & { messageType?: string }>;
              hasMore?: boolean;
              olderCursor?: string | null;
            };
            // toInboxMessageFromWhatsApp preserves the quoted-reply context
            // (#317 B1/B2) so quote chips survive chat switches and restarts.
            const loadedMessages: InboxMessage[] = data.messages.map(
              toInboxMessageFromWhatsApp,
            );
            if (!applyLoadedProjection(loadedMessages)) return;
            setHistoryHasMore(data.hasMore === true);
            setHistoryCursor(data.olderCursor ?? null);
            void markRead(chat);
            return;
          }
        }

        const response = await fetch(
          `/api/conversations/${encodeURIComponent(chat.conversationId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`Conversation load failed: ${response.status}`);
        const data = (await response.json()) as {
          conversation: { messages: SeededMessage[] };
        };
        const loadedMessages: InboxMessage[] = data.conversation.messages.map(
          (message) => ({
            id: message.id,
            body: message.body,
            direction:
              message.direction === "inbound"
                ? "inbound"
                : message.direction === "system"
                  ? "system"
                  : "outbound",
            timestamp: new Date(message.timestamp).getTime(),
            messageType: message.messageType,
            attachment: message.attachment,
          }),
        );
        if (!applyLoadedProjection(loadedMessages)) return;
        setHistoryHasMore(false);
        setHistoryCursor(null);
        void markRead(chat);
      } catch {
        if (
          !background &&
          canApplyLoadedProjection() &&
          messageMutationGenerationRef.current === mutationGeneration
        ) {
          replaceMessages([]);
        }
      } finally {
        if (
          foregroundLoad !== null &&
          foregroundMessageLoadRef.current === foregroundLoad
        ) {
          setLoadingMessages(false);
        }
      }
    },
    [markRead, replaceMessages],
  );

  /**
   * Ledger INB-11: prepend the next older page of durable history for the
   * active chat. Strictly additive — the cursor page can never overlap the
   * rows already held, so no merge is needed; in-flight optimistic mutations
   * stay untouched (mutateMessages keeps their generation).
   */
  const loadOlderMessages = useCallback(async () => {
    const chat = activeChatRef.current;
    if (
      !chat ||
      loadingOlderMessages ||
      !historyCursor ||
      chat.channel !== "whatsapp" ||
      !chat.transportId
    ) {
      return false;
    }
    const requestedConversationId = chat.conversationId;
    setLoadingOlderMessages(true);
    try {
      const response = await fetch(
        `/api/whatsapp/chats/${encodeURIComponent(chat.transportId)}/messages?limit=200&before=${encodeURIComponent(historyCursor)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return false;
      const data = (await response.json()) as {
        messages?: Array<IncomingMessage & { messageType?: string }>;
        hasMore?: boolean;
        olderCursor?: string | null;
      };
      const older: InboxMessage[] = (data.messages ?? []).map(
        toInboxMessageFromWhatsApp,
      );
      if (activeChatRef.current?.conversationId !== requestedConversationId) {
        return false;
      }
      if (older.length > 0) {
        mutateMessages(requestedConversationId, (current) => [
          ...older,
          ...current,
        ]);
      }
      setHistoryHasMore(data.hasMore === true);
      setHistoryCursor(data.olderCursor ?? null);
      return true;
    } catch {
      return false;
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [historyCursor, loadingOlderMessages, mutateMessages]);

  const persistDraft = useCallback(
    async (conversationId: string, body: string) => {
      if (!canReply) return false;
      let revision = (draftRevisionRef.current.get(conversationId) ?? 0) + 1;
      draftRevisionRef.current.set(conversationId, revision);
      const previous =
        draftWriteQueueRef.current.get(conversationId) ?? Promise.resolve(true);
      const write = previous.catch(() => false).then(async () => {
        for (let attempt = 0; attempt < DRAFT_WRITE_ATTEMPTS; attempt += 1) {
          try {
            const response = await fetch(
              `/api/conversations/${encodeURIComponent(conversationId)}/draft`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body, revision }),
              },
            );
            if (!response.ok) return false;
            const data = (await response.json()) as {
              applied?: unknown;
              revision?: unknown;
            };
            if (
              typeof data.revision !== "number" ||
              !Number.isSafeInteger(data.revision) ||
              data.revision < 0
            ) {
              return false;
            }
            draftRevisionRef.current.set(
              conversationId,
              Math.max(
                data.revision,
                draftRevisionRef.current.get(conversationId) ?? 0,
              ),
            );
            if (data.applied === true) return true;
            revision =
              Math.max(
                data.revision,
                draftRevisionRef.current.get(conversationId) ?? 0,
              ) + 1;
            draftRevisionRef.current.set(conversationId, revision);
          } catch {
            return false;
          }
        }
        return false;
      });
      draftWriteQueueRef.current.set(conversationId, write);
      try {
        return await write;
      } finally {
        if (draftWriteQueueRef.current.get(conversationId) === write) {
          draftWriteQueueRef.current.delete(conversationId);
        }
      }
    },
    [canReply],
  );

  const loadDraft = useCallback(
    async (chat: InboxChat) => {
      const generation = ++draftLoadGenerationRef.current;
      const editGeneration = draftEditGenerationRef.current;
      if (!canReply) return;
      const isCurrentDraft = () =>
        generation === draftLoadGenerationRef.current &&
        activeChatRef.current?.conversationId === chat.conversationId;

      let pendingWrite = draftWriteQueueRef.current.get(chat.conversationId);
      while (pendingWrite) {
        await pendingWrite.catch(() => false);
        const nextWrite = draftWriteQueueRef.current.get(chat.conversationId);
        if (!nextWrite || nextWrite === pendingWrite) break;
        pendingWrite = nextWrite;
      }
      if (!isCurrentDraft()) return;

      let response: Response | null = null;
      for (let attempt = 0; attempt < DRAFT_LOAD_ATTEMPTS; attempt += 1) {
        if (!isCurrentDraft()) return;
        try {
          const candidate = await fetch(
            `/api/conversations/${encodeURIComponent(chat.conversationId)}/draft`,
            { cache: "no-store" },
          );
          if (candidate.ok) {
            response = candidate;
            break;
          }
        } catch {
        }
        if (!isCurrentDraft()) return;
        if (attempt + 1 < DRAFT_LOAD_ATTEMPTS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, DRAFT_LOAD_RETRY_MS),
          );
        }
      }
      if (!response || !isCurrentDraft()) return;

      const data = (await response.json()) as {
        body?: unknown;
        revision?: unknown;
      };
      if (
        !isCurrentDraft() ||
        typeof data.body !== "string" ||
        typeof data.revision !== "number" ||
        !Number.isSafeInteger(data.revision) ||
        data.revision < 0
      ) {
        return;
      }
      draftRevisionRef.current.set(
        chat.conversationId,
        Math.max(
          data.revision,
          draftRevisionRef.current.get(chat.conversationId) ?? 0,
        ),
      );
      draftReadyConversationRef.current = chat.conversationId;
      if (draftEditGenerationRef.current === editGeneration) {
        const draftBody = data.body;
        replyTextRef.current = draftBody;
        setReplyTextState(draftBody);
        setLocalDrafts((drafts) => {
          const next = { ...drafts };
          if (draftBody.trim()) next[chat.conversationId] = draftBody;
          else delete next[chat.conversationId];
          return next;
        });
      } else {
        void persistDraft(chat.conversationId, replyTextRef.current);
      }
    },
    [canReply, persistDraft],
  );

  const handleStatusChange = useCallback(
    (nextStatus: WhatsAppStatus, _user: WhatsAppUser | null) => {
      setSidecarReachable(true);
      setSidecarStatus(nextStatus);
      void loadChats();
    },
    [loadChats],
  );

  const handleMessage = useCallback(
    (message: IncomingMessage) => {
      const activeTransportId = activeTransportIdRef.current;
      const activeChat = activeChatRef.current;
      const activeConversationId = activeChat?.conversationId;
      if (
        activeChat &&
        activeConversationId &&
        activeTransportId &&
        activeTransportId === message.key.remoteJid
      ) {
        mutateMessages(activeConversationId, (current) => {
          if (current.some((entry) => entry.id === message.key.id)) return current;
          return [
            ...current,
            {
              id: message.key.id,
              body: messageText(message.message),
              direction: message.key.fromMe ? "outbound" : "inbound",
              timestamp: message.messageTimestamp * 1000,
              deliveryStatus: message.deliveryStatus,
              outboxEffectKey: message.effectKey,
              outboxState: message.effectState,
              outboxErrorCode: message.effectErrorCode ?? null,
            },
          ];
        });
        void loadMessages(activeChat, { background: true });
      }
      scheduleChatsRefresh();
    },
    [loadMessages, mutateMessages, scheduleChatsRefresh],
  );

  const handleMessageUpdate = useCallback(
    (
      updates: Array<{
        jid: string;
        id: string;
        fromMe: boolean;
        update: Record<string, unknown>;
      }>,
    ) => {
      const activeTransportId = activeTransportIdRef.current;
      const activeConversationId = activeChatRef.current?.conversationId;
      if (!activeTransportId || !activeConversationId) return;
      const relevant = updates.filter(
        (update) => update.jid === activeTransportId && update.fromMe,
      );
      if (relevant.length === 0) return;
      mutateMessages(activeConversationId, (current) => {
        let changed = false;
        const next = current.map((message) => {
          const update = relevant.find((entry) => entry.id === message.id);
          if (!update) return message;
          const deliveryStatus = mapDeliveryStatus(update.update);
          if (!deliveryStatus || deliveryStatus === message.deliveryStatus) {
            return message;
          }
          changed = true;
          return { ...message, deliveryStatus };
        });
        return changed ? next : current;
      });
    },
    [mutateMessages],
  );

  const { status, user, wsOpen, reconnect } = useWhatsAppSocket({
    onStatusChange: handleStatusChange,
    onMessage: handleMessage,
    onMessageUpdate: handleMessageUpdate,
  });

  useEffect(() => {
    const initialId = window.setTimeout(() => {
      void loadChats();
    }, 0);
    return () => {
      window.clearTimeout(initialId);
      if (chatRefreshTimerRef.current !== null) {
        window.clearTimeout(chatRefreshTimerRef.current);
        chatRefreshTimerRef.current = null;
      }
    };
  }, [loadChats]);

  useEffect(() => {
    if (
      wsOpen ||
      sidecarReachable !== true ||
      sidecarStatus !== "connected" ||
      sending
    ) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const refreshDurableProjection = async () => {
      if (
        cancelled ||
        inFlight ||
        sendingRef.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      inFlight = true;
      try {
        await loadChats();
        if (cancelled || sendingRef.current) return;
        const chat = activeChatRef.current;
        if (chat) await loadMessages(chat, { background: true });
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshDurableProjection();
    }, LIVE_RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loadChats, loadMessages, sending, sidecarReachable, sidecarStatus, wsOpen]);

  const selectChat = useCallback(
    (chat: InboxChat) => {
      const previousChat = activeChatRef.current;
      if (previousChat?.conversationId === chat.conversationId) return;
      if (previousChat) {
        void persistDraft(previousChat.conversationId, replyTextRef.current);
      }
      messageSelectionGenerationRef.current += 1;
      explicitUnreadHoldRef.current.delete(chat.conversationId);
      activeChatRef.current = chat;
      pinnedDeepLinkChatRef.current = chat;
      setChats((current) => {
        const index = current.findIndex(
          (entry) => entry.conversationId === chat.conversationId,
        );
        if (index === -1) return [chat, ...current];

        const existing = current[index];
        if (!existing) return [chat, ...current];
        if (
          existing.id === chat.id &&
          existing.transportId === chat.transportId &&
          existing.channel === chat.channel
        ) {
          return current;
        }

        const next = [...current];
        next[index] = { ...existing, ...chat };
        return next;
      });
      activeTransportIdRef.current = chat.transportId ?? null;
      setActiveChatId(chat.id);
      // Snapshot the unread count at open time — mark-read lands later, so
      // this is the only truthful moment to place the unread boundary.
      const initialUnread = chat.unread > 0 ? chat.unread : 0;
      setActiveChatInitialUnread(initialUnread);
      activeChatInitialUnreadRef.current = initialUnread;
      initialUnreadScrollDoneRef.current = false;
      prevMessageCountRef.current = 0;
      setIsAwayFromBottom(true);
      setMissedMessageCount(0);
      setHistoryHasMore(false);
      setHistoryCursor(null);
      replaceMessages([]);
      draftReadyConversationRef.current = null;
      setReplyText("");
      void loadMessages(chat);
      void loadDraft(chat);
    },
    [loadDraft, loadMessages, persistDraft, replaceMessages, setReplyText],
  );

  const clearActiveChat = useCallback(() => {
    const previousChat = activeChatRef.current;
    if (previousChat) {
      void persistDraft(previousChat.conversationId, replyTextRef.current);
    }
    messageSelectionGenerationRef.current += 1;
    activeChatRef.current = null;
    activeTransportIdRef.current = null;
    draftLoadGenerationRef.current += 1;
    draftReadyConversationRef.current = null;
    setActiveChatInitialUnread(0);
    activeChatInitialUnreadRef.current = 0;
    initialUnreadScrollDoneRef.current = false;
    setIsAwayFromBottom(false);
    setMissedMessageCount(0);
    setHistoryHasMore(false);
    setHistoryCursor(null);
    setActiveChatId(null);
    replaceMessages([]);
    setReplyText("");
  }, [persistDraft, replaceMessages, setReplyText]);

  /**
   * Permanent multi-select chat deletion (founder-confirmed contract).
   * Server removes messages, effects, ingress events and local media; the
   * queue refreshes and an open deleted chat is dropped without persisting
   * its draft back to the now-deleted conversation. Failures return a
   * coded outcome instead of a bare boolean so the confirm dialog can
   * surface the server's rejection reason.
   */
  const deleteChats = useCallback(
    async (conversationIds: string[]): Promise<DeleteChatsOutcome> => {
      if (!canDeleteChats || conversationIds.length === 0) {
        return { ok: false, errorCode: null, errorDetail: null, rejectionSummary: null, notFoundIds: null };
      }
      // Round 3: pre-flight the exact server contract client-side. A doomed
      // request (empty id, id longer than the 256-char projection contract —
      // round 4: real stores hold legitimate 69-char legacy/provider ids, so
      // the bound widened from the cuid-era 64, founder finding F-04 — or
      // more than 100 ids) must fail HERE with the offending shape named
      // instead of round-tripping to the same coded 400 with no further
      // evidence.
      const oversized = conversationIds.filter(
        (id) => id.length < 1 || id.length > DELETE_CONTRACT_MAX_ID_LENGTH,
      );
      if (conversationIds.length > DELETE_CONTRACT_MAX_IDS || oversized.length > 0) {
        return {
          ok: false,
          errorCode: "INVALID_DELETE_REQUEST",
          errorDetail: "Invalid chat deletion request",
          rejectionSummary:
            `local contract violation — ${conversationIds.length} id(s)` +
            (oversized.length > 0
              ? `, offending lengths [${oversized.map((id) => id.length).join(", ")}] (max ${DELETE_CONTRACT_MAX_ID_LENGTH})`
              : `, max ${DELETE_CONTRACT_MAX_IDS}`),
          notFoundIds: null,
        };
      }
      try {
        const response = await fetch("/api/whatsapp/chats/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: conversationIds }),
        });
        if (!response.ok) {
          let errorCode: string | null = null;
          let errorDetail: string | null = null;
          let rejectionSummary: string | null = null;
          try {
            const body: unknown = await response.json();
            if (body && typeof body === "object") {
              const candidate = body as {
                code?: unknown;
                error?: unknown;
                rejection?: unknown;
              };
              if (typeof candidate.code === "string") {
                errorCode = candidate.code;
              }
              // Keep the server's own message: it names the exact failing
              // condition ("Invalid chat deletion request", LICENSE_*, …)
              // instead of leaving the operator with a bare HTTP status.
              if (typeof candidate.error === "string" && candidate.error) {
                errorDetail = candidate.error;
              }
              // B5 round 3: the server's PII-free shape verdict — the only
              // installed-build evidence of WHY the body failed validation.
              if (candidate.rejection && typeof candidate.rejection === "object") {
                const rejection = candidate.rejection as {
                  reason?: unknown;
                  issues?: unknown;
                  idCount?: unknown;
                  idLengths?: unknown;
                  bodyLength?: unknown;
                };
                if (typeof rejection.reason === "string") {
                  rejectionSummary = describeDeleteRejection({
                    reason: rejection.reason,
                    issues:
                      Array.isArray(rejection.issues) &&
                      rejection.issues.every((issue) => typeof issue === "string")
                        ? (rejection.issues as string[])
                        : undefined,
                    idCount:
                      typeof rejection.idCount === "number"
                        ? rejection.idCount
                        : undefined,
                    idLengths:
                      Array.isArray(rejection.idLengths) &&
                      rejection.idLengths.every((length) => typeof length === "number")
                        ? (rejection.idLengths as number[])
                        : undefined,
                    bodyLength:
                      typeof rejection.bodyLength === "number"
                        ? rejection.bodyLength
                        : undefined,
                  });
                }
              }
            }
          } catch {
            // Non-JSON failure body (e.g. a bare middleware 401): fall back
            // to the numeric status below.
          }
          return {
            ok: false,
            errorCode: errorCode ?? `HTTP_${response.status}`,
            errorDetail,
            rejectionSummary,
            notFoundIds: null,
          };
        }
        // Audit S3-20 (client half): the additive `notFoundIds` verdict from
        // the 200 body — defensive parse, absent on older paired servers.
        let notFoundIds: string[] | null = null;
        try {
          const body = (await response.json()) as { notFoundIds?: unknown };
          if (Array.isArray(body.notFoundIds)) {
            notFoundIds = body.notFoundIds.every(
              (id): id is string => typeof id === "string",
            )
              ? (body.notFoundIds as string[])
              : null;
          }
        } catch {
          // Non-JSON success body — leave null.
        }
        const active = activeChatRef.current;
        if (active && conversationIds.includes(active.conversationId)) {
          messageSelectionGenerationRef.current += 1;
          activeChatRef.current = null;
          activeTransportIdRef.current = null;
          draftLoadGenerationRef.current += 1;
          draftReadyConversationRef.current = null;
          setActiveChatId(null);
          replaceMessages([]);
          setReplyText("");
        }
        await loadChats();
        return {
          ok: true,
          errorCode: null,
          errorDetail: null,
          rejectionSummary: null,
          notFoundIds,
        };
      } catch {
        return { ok: false, errorCode: null, errorDetail: null, rejectionSummary: null, notFoundIds: null };
      }
    },
    [canDeleteChats, loadChats, replaceMessages, setReplyText],
  );

  useEffect(() => {
    if (!requestedConversationId) {
      deepLinkAttemptRef.current = null;
      pinnedDeepLinkChatRef.current = null;
      return;
    }
    if (loadingChats) return;

    if (
      pinnedDeepLinkChatRef.current &&
      pinnedDeepLinkChatRef.current.conversationId !== requestedConversationId
    ) {
      pinnedDeepLinkChatRef.current = null;
    }

    const existingChat = chats.find(
      (chat) => chat.conversationId === requestedConversationId,
    );
    const activeChatStillExists = chats.some(
      (chat) => chat.id === activeChatId,
    );
    if (existingChat) {
      if (
        deepLinkAttemptRef.current !== requestedConversationId ||
        !activeChatStillExists
      ) {
        deepLinkAttemptRef.current = requestedConversationId;
        selectChat(existingChat);
      }
      return;
    }
    if (deepLinkAttemptRef.current === requestedConversationId) return;

    deepLinkAttemptRef.current = requestedConversationId;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(requestedConversationId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (response.status >= 500 && !cancelled) {
            deepLinkAttemptRef.current = null;
          }
          return;
        }
        const data = (await response.json()) as {
          conversation: ConversationProjection & { messages: SeededMessage[] };
        };
        if (cancelled) return;
        const chat = mapConversationProjection(
          data.conversation,
          copy("restrictedContact"),
        );
        pinnedDeepLinkChatRef.current = chat;
        setChats((current) =>
          current.some(
            (entry) => entry.conversationId === chat.conversationId,
          )
            ? current
            : [chat, ...current],
        );
        selectChat(chat);
      } catch {
        if (!cancelled) deepLinkAttemptRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeChatId,
    chats,
    copy,
    loadingChats,
    requestedConversationId,
    selectChat,
  ]);

  useEffect(() => {
    isNearBottomRef.current = true;
    const inner = messagesInnerRef.current;
    if (!inner) return;
    const viewport = inner.closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLDivElement | null;
    if (!viewport) return;
    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 150;
      isNearBottomRef.current = nearBottom;
      setIsAwayFromBottom(!nearBottom);
      if (nearBottom) setMissedMessageCount(0);
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [activeChatId]);

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (grew) setMissedMessageCount((current) => current + 1);
  }, [messages]);

  // Open-at-first-unread (WhatsApp behavior): when a conversation opened with
  // unread messages loads its first page, anchor the viewport on the first
  // unread message instead of forcing the tail. Later arrivals follow the
  // normal stick-to-bottom rule.
  useEffect(() => {
    const unread = activeChatInitialUnreadRef.current;
    if (
      initialUnreadScrollDoneRef.current ||
      unread <= 0 ||
      loadingMessages ||
      messages.length === 0
    ) {
      return;
    }
    initialUnreadScrollDoneRef.current = true;
    const targetIndex = Math.min(
      messages.length - 1,
      Math.max(0, messages.length - unread),
    );
    // The unread window may already be the tail — in that case stay pinned.
    if (targetIndex >= messages.length - 1) {
      isNearBottomRef.current = true;
      setIsAwayFromBottom(false);
      return;
    }
    isNearBottomRef.current = false;
    setIsAwayFromBottom(true);
    const targetId = messages[targetIndex]?.id;
    if (!targetId) return;
    requestAnimationFrame(() => {
      const element = messagesInnerRef.current?.querySelector(
        `[data-message-id="${CSS.escape(targetId)}"]`,
      );
      element?.scrollIntoView({ block: "center" });
    });
  }, [messages, loadingMessages]);

  const scrollToLatestMessages = useCallback(() => {
    isNearBottomRef.current = true;
    setIsAwayFromBottom(false);
    setMissedMessageCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const dismissUnreadDivider = useCallback(() => {
    setActiveChatInitialUnread(0);
    activeChatInitialUnreadRef.current = 0;
  }, []);

  useEffect(() => {
    if (status !== "qr") return;
    const timer = window.setInterval(() => setQrKey((current) => current + 1), 20_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const monitorWhatsAppEffect = useCallback(
    async (
      conversationId: string,
      effectKey: string,
      localMessageId: string,
    ) => {
      // Applies one outbox poll to the local projection. Returns true when the
      // effect reached a terminal state and monitoring can stop.
      const applyOutboxPoll = async (): Promise<boolean> => {
        const response = await fetch(
          `/api/whatsapp/outbox?effectKey=${encodeURIComponent(effectKey)}`,
        );
        if (!response.ok) return false;
        const data = (await response.json()) as {
          effect: {
            state: InboxMessage["outboxState"];
            providerMessageId: string | null;
            errorCode?: string | null;
          };
        };
        const state = data.effect.state;
        if (state === "succeeded") {
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              localMessageId,
              data.effect.providerMessageId,
              {
                deliveryStatus: "sent",
                outboxEffectKey: effectKey,
                outboxState: state,
                outboxErrorCode: null,
              },
            ),
          );
          const active = activeChatRef.current;
          if (active?.conversationId === conversationId) {
            void loadMessages(active, { background: true });
          }
          return true;
        }
        if (state === "ambiguous" || state === "dead_letter") {
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              localMessageId,
              data.effect.providerMessageId,
              {
                deliveryStatus: "failed",
                outboxEffectKey: effectKey,
                outboxState: state,
                outboxErrorCode: data.effect.errorCode ?? null,
              },
            ),
          );
          if (activeChatRef.current?.conversationId === conversationId) {
            setSendError(
              state === "ambiguous"
                ? t("inbox.whatsappAmbiguous")
                : t("inbox.sendFailed"),
            );
          }
          return true;
        }
        mutateMessages(conversationId, (current) =>
          reconcileInboxProviderMessage(
            current,
            localMessageId,
            data.effect.providerMessageId,
            {
              outboxEffectKey: effectKey,
              outboxState: state,
            },
          ),
        );
        return false;
      };
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 1_000 : 3_000),
        );
        try {
          if (await applyOutboxPoll()) return;
        } catch {
        }
      }
      // Budget exhausted (≈6 min): without a final reconcile the bubble could
      // keep its optimistic "sending" clock even after the durable effect
      // later resolved server-side (worker backoff can outlive the monitor).
      try {
        await applyOutboxPoll();
      } catch {
      }
    },
    [loadMessages, mutateMessages, t],
  );

  const resolveAmbiguousRetry = useCallback((confirmed: boolean) => {
    setAmbiguousRetryMessage(null);
    ambiguousRetryResolveRef.current?.(confirmed);
    ambiguousRetryResolveRef.current = null;
  }, []);

  const retryFailedMessage = useCallback(
    async (message: InboxMessage) => {
      const conversationId = activeChatRef.current?.conversationId;
      if (!message.outboxEffectKey || !conversationId) return;
      let confirmMayDuplicate = false;
      if (message.outboxState === "ambiguous") {
        // Ledger INB-29: one dialog at a time; the answer arrives through the
        // AlertDialog rendered by the thread surface.
        if (ambiguousRetryResolveRef.current) return;
        confirmMayDuplicate = await new Promise<boolean>((resolve) => {
          ambiguousRetryResolveRef.current = resolve;
          setAmbiguousRetryMessage(message);
        });
        if (!confirmMayDuplicate) return;
      }

      mutateMessages(conversationId, (current) =>
        current.map((entry) =>
          entry.id === message.id ? { ...entry, deliveryStatus: "sending" } : entry,
        ),
      );
      setSendError(null);
      try {
        const response = await fetch("/api/whatsapp/outbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effectKey: message.outboxEffectKey,
            confirmMayDuplicate,
          }),
        });
        const data = (await response.json()) as {
          effect?: {
            state: InboxMessage["outboxState"];
            providerMessageId: string | null;
          };
        };
        if (!data.effect) throw new Error(t("inbox.sendFailed"));
        if (data.effect.state === "succeeded") {
          mutateMessages(conversationId, (current) =>
            reconcileInboxProviderMessage(
              current,
              message.id,
              data.effect?.providerMessageId,
              {
                deliveryStatus: "sent",
                outboxEffectKey: message.outboxEffectKey,
                outboxState: "succeeded",
              },
            ),
          );
          const active = activeChatRef.current;
          if (active?.conversationId === conversationId) {
            void loadMessages(active, { background: true });
          }
          return;
        }
        if (response.status === 202) {
          void monitorWhatsAppEffect(
            conversationId,
            message.outboxEffectKey,
            message.id,
          );
          return;
        }
        throw new Error(
          data.effect.state === "ambiguous"
            ? t("inbox.whatsappAmbiguous")
            : t("inbox.sendFailed"),
        );
      } catch (error) {
        mutateMessages(conversationId, (current) =>
          current.map((entry) =>
            entry.id === message.id
              ? { ...entry, deliveryStatus: "failed" }
              : entry,
          ),
        );
        if (activeChatRef.current?.conversationId === conversationId) {
          setSendError(
            error instanceof Error ? error.message : t("inbox.sendFailed"),
          );
        }
      }
    },
    [monitorWhatsAppEffect, mutateMessages, t],
  );

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );

  useEffect(() => {
    if (
      !activeChat ||
      !canReply ||
      draftReadyConversationRef.current !== activeChat.conversationId
    ) {
      return;
    }
    const conversationId = activeChat.conversationId;
    const body = replyText;
    const timer = window.setTimeout(() => {
      void persistDraft(conversationId, body);
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeChat, canReply, persistDraft, replyText]);

  const flushDraftForLifecycle = useCallback(() => {
    const chat = activeChatRef.current;
    if (
      !canReply ||
      !chat ||
      draftReadyConversationRef.current !== chat.conversationId
    ) {
      return;
    }
    const revision =
      (draftRevisionRef.current.get(chat.conversationId) ?? 0) + 1;
    draftRevisionRef.current.set(chat.conversationId, revision);
    void fetch(
      `/api/conversations/${encodeURIComponent(chat.conversationId)}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyTextRef.current, revision }),
        keepalive: true,
      },
    ).catch(() => undefined);
  }, [canReply]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDraftForLifecycle();
    };
    window.addEventListener("pagehide", flushDraftForLifecycle);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushDraftForLifecycle);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushDraftForLifecycle();
    };
  }, [flushDraftForLifecycle]);

  const effectiveStatus = status ?? sidecarStatus;
  const transport: InboxTransportState = {
    reachable: status !== null ? true : sidecarReachable,
    status: effectiveStatus,
    user,
    wsOpen,
  };

  const sendReply = useCallback(
    async (quotedMessageId?: string | null) => {
    const chat = chats.find((entry) => entry.id === activeChatId) ?? null;
    if (
      !chat ||
      chat.channel !== "whatsapp" ||
      !chat.transportId ||
      effectiveStatus !== "connected" ||
      !canReply ||
      sendingRef.current ||
      !replyText.trim()
    ) {
      return;
    }

    const trimmedQuotedId = quotedMessageId?.trim() || null;
    const quotedTarget = trimmedQuotedId
      ? messagesRef.current.find((message) => message.id === trimmedQuotedId) ?? null
      : null;
    const tempId = crypto.randomUUID();
    const body = replyText.trim();
    const clearAcceptedDraft = () => {
      if (activeChatRef.current?.conversationId === chat.conversationId) {
        setReplyText("");
      }
      void persistDraft(chat.conversationId, "");
    };
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    mutateMessages(chat.conversationId, (current) => [
      ...current,
      {
        id: tempId,
        body,
        direction: "outbound",
        timestamp: Date.now(),
        deliveryStatus: "sending",
        ...(trimmedQuotedId
          ? {
              quotedMessageId: trimmedQuotedId,
              quoted: quotedTarget
                ? {
                    fromMe: quotedTarget.direction === "outbound",
                    preview: Array.from(quotedTarget.body).slice(0, 200).join(""),
                    messageType: quotedTarget.messageType ?? null,
                  }
                : null,
            }
          : {}),
      },
    ]);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Ledger INB-31: text sends get a hard timeout so a hung request can
        // never leave the bubble in "sending" limbo — the timeout raises a
        // DOMException that the existing failure reconciliation already
        // converts into a failed-with-retry bubble (durable outbox truth is
        // unaffected: the effectKey contract owns actual delivery state).
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          clientMessageId: tempId,
          to: chat.transportId,
          text: body,
          ...(trimmedQuotedId ? { quotedMessageId: trimmedQuotedId } : {}),
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        accepted?: boolean;
        id?: string | null;
        effectKey?: string;
        state?: InboxMessage["outboxState"];
        requiresDuplicateConfirmation?: boolean;
      };
      if (response.status === 202 && data.accepted && data.effectKey) {
        clearAcceptedDraft();
        mutateMessages(chat.conversationId, (current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  ...message,
                  outboxEffectKey: data.effectKey,
                  outboxState: data.state,
                }
              : message,
          ),
        );
        void monitorWhatsAppEffect(
          chat.conversationId,
          data.effectKey,
          tempId,
        );
        return;
      }
      if (!response.ok || !data.ok) {
        mutateMessages(chat.conversationId, (current) =>
          current.map((message) =>
            message.id === tempId
              ? {
                  ...message,
                  deliveryStatus: "failed",
                  outboxEffectKey: data.effectKey,
                  outboxState: data.state,
                }
              : message,
          ),
        );
        throw new Error(
          data.requiresDuplicateConfirmation
            ? t("inbox.whatsappAmbiguous")
            : t("inbox.sendFailed"),
        );
      }
      mutateMessages(chat.conversationId, (current) =>
        reconcileInboxProviderMessage(current, tempId, data.id, {
          deliveryStatus: "sent",
          outboxEffectKey: data.effectKey,
          outboxState: "succeeded",
        }),
      );
      clearAcceptedDraft();
      void loadChats();
    } catch (error) {
      mutateMessages(chat.conversationId, (current) =>
        current.map((message) =>
          message.id === tempId
            ? { ...message, deliveryStatus: "failed" }
            : message,
        ),
      );
      if (activeChatRef.current?.conversationId === chat.conversationId) {
        setSendError(
          error instanceof Error ? error.message : t("inbox.sendFailed"),
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [
    activeChatId,
    canReply,
    chats,
    effectiveStatus,
    loadChats,
    monitorWhatsAppEffect,
    mutateMessages,
    persistDraft,
    replyText,
    setReplyText,
    t,
  ]);

  // Ledger INB-28: one durable media-send factory. The four former ~200-line
  // copies (image/video/document/voice) differed only in their spec — the
  // endpoint, the form field, the bounded byte ceiling, the authenticated
  // media-type gate, the attachment kind and whether WhatsApp carries the
  // composer caption. Every behavioral guarantee is unchanged: bounded files,
  // optimistic message with quoted provenance, upload progress + in-flight
  // cancellation, durable effect-key reconciliation, pre-effect abort
  // dropping only the optimistic row, and the shared sending gate.
  const createMediaSender = useCallback(
    (spec: MediaSendSpec) =>
      async (file: File, quotedMessageId?: string | null) => {
        const chat = chats.find((entry) => entry.id === activeChatId) ?? null;
        const mediaType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (
          !chat ||
          chat.channel !== "whatsapp" ||
          !chat.transportId ||
          effectiveStatus !== "connected" ||
          !canReply ||
          sendingRef.current
        ) {
          return;
        }
        if (
          file.size <= 0 ||
          file.size > spec.maxBytes ||
          spec.rejects(mediaType)
        ) {
          setSendError(t("inbox.sendFailed"));
          return;
        }

        const trimmedQuotedId = quotedMessageId?.trim() || null;
        const quotedTarget = trimmedQuotedId
          ? messagesRef.current.find((message) => message.id === trimmedQuotedId) ?? null
          : null;
        const tempId = crypto.randomUUID();
        const caption = spec.carriesCaption ? replyText.trim() : "";
        let knownEffectKey: string | null = null;
        const clearAcceptedDraft = () => {
          if (activeChatRef.current?.conversationId === chat.conversationId) {
            setReplyText("");
          }
          void persistDraft(chat.conversationId, "");
        };
        sendingRef.current = true;
        setSending(true);
        setSendError(null);
        // WhatsApp audio carries no caption: the composer draft is left
        // intact and the canonical Message body is empty.
        mutateMessages(chat.conversationId, (current) => [
          ...current,
          {
            id: tempId,
            body: caption,
            direction: "outbound",
            timestamp: Date.now(),
            messageType: spec.kind,
            deliveryStatus: "sending",
            ...(trimmedQuotedId
              ? {
                  quotedMessageId: trimmedQuotedId,
                  quoted: quotedTarget
                    ? {
                        fromMe: quotedTarget.direction === "outbound",
                        preview: Array.from(quotedTarget.body).slice(0, 200).join(""),
                        messageType: quotedTarget.messageType ?? null,
                      }
                    : null,
                }
              : {}),
            attachment: {
              formatVersion: 1,
              kind: spec.kind,
              state: "ready",
              mimeType: mediaType,
              fileName: spec.kind === "audio" ? null : file.name || null,
              sizeBytes: file.size,
              durationSeconds: null,
              width: null,
              height: null,
              voiceMessage: false,
              location: null,
              contact: null,
              failureCode: null,
            },
          },
        ]);

        try {
          const form = new FormData();
          form.set("clientMessageId", tempId);
          form.set("to", chat.transportId);
          if (spec.carriesCaption) form.set("caption", caption);
          if (trimmedQuotedId) form.set("quotedMessageId", trimmedQuotedId);
          form.set(spec.fieldName, file, file.name || spec.fallbackFileName);
          const { status: responseStatus, data } = await postFormWithUploadProgress(
            spec.endpoint,
            form,
            (percent) => markUploadProgress(tempId, percent),
            (abort) => uploadCancelRef.current.set(tempId, abort),
          );
          knownEffectKey = data.effectKey ?? null;
          clearUploadState(tempId);

          if (responseStatus === 202 && data.accepted && data.effectKey) {
            if (spec.carriesCaption) clearAcceptedDraft();
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId
                  ? {
                      ...message,
                      outboxEffectKey: data.effectKey,
                      outboxState: data.state,
                    }
                  : message,
              ),
            );
            await loadMessages(chat, { background: true });
            void monitorWhatsAppEffect(
              chat.conversationId,
              data.effectKey,
              tempId,
            );
            void loadChats();
            return;
          }

          if (!(responseStatus >= 200 && responseStatus < 300) || !data.ok) {
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId
                  ? {
                      ...message,
                      deliveryStatus: "failed",
                      outboxEffectKey: data.effectKey,
                      outboxState: data.state,
                    }
                  : message,
              ),
            );
            if (data.effectKey) {
              await loadMessages(chat, { background: true });
            }
            throw new Error(
              data.requiresDuplicateConfirmation
                ? t("inbox.whatsappAmbiguous")
                : t("inbox.sendFailed"),
            );
          }

          mutateMessages(chat.conversationId, (current) =>
            reconcileInboxProviderMessage(current, tempId, data.id, {
              deliveryStatus: "sent",
              outboxEffectKey: data.effectKey,
              outboxState: "succeeded",
            }),
          );
          if (spec.carriesCaption) clearAcceptedDraft();
          await loadMessages(chat, { background: true });
          void loadChats();
        } catch (error) {
          clearUploadState(tempId);
          if (error instanceof DOMException && error.name === "AbortError") {
            // Pre-effect cancellation (#317): the request never completed, so
            // no durable intent can exist. Drop only the optimistic message.
            mutateMessages(chat.conversationId, (current) =>
              current.filter((message) => message.id !== tempId),
            );
            return;
          }
          if (knownEffectKey) {
            mutateMessages(chat.conversationId, (current) =>
              current.map((message) =>
                message.id === tempId
                  ? { ...message, deliveryStatus: "failed" }
                  : message,
              ),
            );
          } else {
            mutateMessages(chat.conversationId, (current) =>
              current.filter((message) => message.id !== tempId),
            );
            await loadMessages(chat, { background: true });
          }
          if (activeChatRef.current?.conversationId === chat.conversationId) {
            setSendError(
              error instanceof Error ? error.message : t("inbox.sendFailed"),
            );
          }
        } finally {
          sendingRef.current = false;
          setSending(false);
        }
      },
    [
      activeChatId,
      canReply,
      chats,
      clearUploadState,
      effectiveStatus,
      loadChats,
      loadMessages,
      markUploadProgress,
      monitorWhatsAppEffect,
      mutateMessages,
      persistDraft,
      replyText,
      setReplyText,
      t,
    ],
  );

  const sendImage = useMemo(() => createMediaSender(MEDIA_SEND_SPECS.image), [createMediaSender]);
  const sendVideo = useMemo(() => createMediaSender(MEDIA_SEND_SPECS.video), [createMediaSender]);
  const sendDocument = useMemo(
    () => createMediaSender(MEDIA_SEND_SPECS.document),
    [createMediaSender],
  );
  const sendVoice = useMemo(() => createMediaSender(MEDIA_SEND_SPECS.voice), [createMediaSender]);

  // Ledger INB-12: pin / mute / archive from the queue. Optimistic mirror of
  // the server truth with an honest rollback; a background refresh
  // reconciles the mute horizon.
  const setConversationState = useCallback(
    async (
      chat: InboxChat,
      patch: { pinned?: boolean; muted?: boolean; archived?: boolean },
    ): Promise<boolean> => {
      if (!canUpdateConversation) return false;
      const conversationId = chat.conversationId;
      const previous = chats.find(
        (entry) => entry.conversationId === conversationId,
      );
      setChats((current) =>
        current.map((entry) =>
          entry.conversationId === conversationId
            ? {
                ...entry,
                pinned: patch.pinned ?? entry.pinned,
                muted: patch.muted ?? entry.muted,
                archived: patch.archived ?? entry.archived,
              }
            : entry,
        ),
      );
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/state`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!response.ok) throw new Error(`state update: ${response.status}`);
        scheduleChatsRefresh();
        return true;
      } catch {
        if (previous) {
          setChats((current) =>
            current.map((entry) =>
              entry.conversationId === conversationId ? previous : entry,
            ),
          );
        }
        return false;
      }
    },
    [canUpdateConversation, chats, scheduleChatsRefresh],
  );

  const connectWhatsApp = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/connect", { method: "POST" });
      if (!response.ok) throw new Error(`WhatsApp connect failed: ${response.status}`);
      reconnect();
      return true;
    } catch {
      toast.error(t("common.error"));
      return false;
    }
  }, [reconnect, t]);

  const disconnectWhatsApp = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/logout", { method: "DELETE" });
      if (!response.ok) throw new Error(`WhatsApp logout failed: ${response.status}`);
      reconnect();
      void loadChats();
    } catch {
      toast.error(t("common.error"));
    }
  }, [loadChats, reconnect, t]);

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return chats
      .filter((chat) => {
      // Ledger INB-12: archived conversations live in their own queue only.
      if (queueFilter === "archived") {
        if (!chat.archived) return false;
      } else if (chat.archived) {
        return false;
      }
      const statusValue = chat.workflow.status ?? "open";
      const queueMatches =
        queueFilter === "all" ||
        (queueFilter === "unread" && chat.unread > 0) ||
        (queueFilter === "open" && statusValue === "open") ||
        (queueFilter === "pending" && statusValue === "pending") ||
        (queueFilter === "resolved" && statusValue === "resolved");
      if (!queueMatches) return false;
      if (!query) return true;
      return [chat.name, chat.phone, chat.lastMessageText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query));
      })
      // Pinned conversations float first (INB-12); the stable sort keeps the
      // server's recency order inside each group.
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [chats, queueFilter, searchQuery]);

  const queueCounts = useMemo(
    () => ({
      all: chats.length,
      unread: chats.filter((chat) => chat.unread > 0).length,
      open: chats.filter((chat) => (chat.workflow.status ?? "open") === "open").length,
      pending: chats.filter((chat) => chat.workflow.status === "pending").length,
      resolved: chats.filter((chat) => chat.workflow.status === "resolved").length,
    }),
    [chats],
  );

  return {
    t,
    locale,
    copy,
    chats,
    filteredChats,
    queueCounts,
    queueFilter,
    setQueueFilter,
    searchQuery,
    setSearchQuery,
    loadingChats,
    activeChat,
    activeChatId,
    selectChat,
    clearActiveChat,
    messages,
    loadingMessages,
    messagesInnerRef,
    messagesEndRef,
    isAwayFromBottom,
    missedMessageCount,
    activeChatInitialUnread,
    scrollToLatestMessages,
    dismissUnreadDivider,
    replyText,
    setReplyText,
    localDrafts,
    sending,
    sendError,
    setSendError,
    sendReply,
    sendImage,
    sendVideo,
    sendDocument,
    sendVoice,
    uploads,
    cancelUpload,
    retryFailedMessage,
    ambiguousRetryMessage,
    resolveAmbiguousRetry,
    historyHasMore,
    loadingOlderMessages,
    loadOlderMessages,
    markUnread,
    setConversationState,
    canUpdateConversation,
    canReply,
    canDeleteChats,
    deleteChats,
    canManageWhatsApp,
    transport,
    dataDegraded,
    refreshChats: loadChats,
    reconnect,
    connectWhatsApp,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    disconnectWhatsApp,
    qrKey,
    refreshQr: () => setQrKey((current) => current + 1),
  };
}
