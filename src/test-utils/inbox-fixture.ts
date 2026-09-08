/**
 * Inbox workspace fixture.
 *
 * `useInboxWorkspace` returns a 102-field object that five components consume
 * whole (`workspace: ReturnType<typeof useInboxWorkspace>`). A render test
 * cannot call the real hook — it needs a database, a socket and a sidecar — so
 * this factory produces a realistic stand-in with every field the Inbox
 * components read, overridable per test.
 *
 * The factory is deliberately NOT typed as the hook's return type: it is a test
 * double, and pinning it to the exact 102-field shape would make every fixture
 * update a 100-line diff. Consumers cast at the call site.
 */
import { vi } from "vitest";

import type {
  InboxChat,
  InboxMessage,
  InboxUploadState,
} from "@/components/inbox/inbox-workspace-types";

export function makeMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 10)}`,
    body: "Message body",
    direction: "inbound",
    timestamp: Date.UTC(2026, 8, 1, 12, 0, 0),
    messageType: "text",
    deliveryStatus: "delivered",
    ...overrides,
  };
}

/** A chronological thread of `count` alternating messages, oldest first. */
export function makeThread(count: number): InboxMessage[] {
  const base = Date.UTC(2026, 8, 1, 8, 0, 0);
  return Array.from({ length: count }, (_, index) =>
    makeMessage({
      id: `msg-${String(index).padStart(4, "0")}`,
      body: `Message number ${index}`,
      direction: index % 2 === 0 ? "inbound" : "outbound",
      timestamp: base + index * 60_000,
    }),
  );
}

export function makeChat(overrides: Partial<InboxChat> = {}): InboxChat {
  return {
    id: "213555000001@s.whatsapp.net",
    conversationId: "conv_fixture_0001",
    transportId: "213555000001@s.whatsapp.net",
    name: "Amina B.",
    phone: "0555000001",
    channel: "whatsapp",
    lastMessageText: "Message body",
    lastMessageAt: Date.UTC(2026, 8, 1, 12, 0, 0),
    lastMessageFromMe: false,
    lastMessageType: "text",
    unread: 0,
    pinned: false,
    muted: false,
    archived: false,
    workflow: {},
    ...overrides,
  };
}

interface WorkspaceOverrides {
  messages?: InboxMessage[];
  activeChat?: InboxChat | null;
  uploads?: Record<string, InboxUploadState>;
  [key: string]: unknown;
}

/**
 * Build the workspace object the Inbox components destructure.
 *
 * `copy`/`t` echo their key so assertions can target a stable, locale-free
 * token instead of a translated string — the render tests here prove BEHAVIOR;
 * the existing locale-parity suites own copy truth.
 */
export function makeInboxWorkspace(overrides: WorkspaceOverrides = {}) {
  const messages = overrides.messages ?? makeThread(10);
  const activeChat =
    overrides.activeChat === undefined ? makeChat() : overrides.activeChat;

  const workspace = {
    // ── thread ──────────────────────────────────────────────────────────────
    activeChat,
    messages,
    loadingMessages: false,
    messagesInnerRef: { current: null },
    messagesEndRef: { current: null },
    isAwayFromBottom: false,
    missedMessageCount: 0,
    activeChatInitialUnread: 0,
    scrollToLatestMessages: vi.fn(),
    dismissUnreadDivider: vi.fn(),
    historyHasMore: false,
    loadingOlderMessages: false,
    loadOlderMessages: vi.fn(),

    // ── locale ──────────────────────────────────────────────────────────────
    locale: "en" as const,
    t: (key: string) => key,
    copy: (key: string) => key,

    // ── composer / outbox ───────────────────────────────────────────────────
    replyText: "",
    setReplyText: vi.fn(),
    sending: false,
    sendError: null,
    setSendError: vi.fn(),
    sendReply: vi.fn(),
    sendImage: vi.fn(),
    sendVideo: vi.fn(),
    sendDocument: vi.fn(),
    sendVoice: vi.fn(),
    uploads: overrides.uploads ?? {},
    cancelUpload: vi.fn(),
    retryFailedMessage: vi.fn(),
    ambiguousRetryMessage: null,
    resolveAmbiguousRetry: vi.fn(),

    // ── queue ───────────────────────────────────────────────────────────────
    chats: activeChat ? [activeChat] : [],
    loadingChats: false,
    queueFilter: "all" as const,
    setQueueFilter: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectChat: vi.fn(),
    localDrafts: {} as Record<string, string>,
    refreshChats: vi.fn(),
    markUnread: vi.fn(),
    setConversationState: vi.fn(),
    dataDegraded: false,

    // ── permissions ─────────────────────────────────────────────────────────
    canReply: true,
    canUpdateConversation: true,
    canDeleteChats: true,
    canManageWhatsApp: true,
    deleteChats: vi.fn(),

    // ── transport ───────────────────────────────────────────────────────────
    transport: {
      reachable: true,
      status: "connected",
      user: { id: "213555999999@s.whatsapp.net", name: "Shop" },
      wsOpen: true,
    },
    reconnect: vi.fn(),
    connectWhatsApp: vi.fn(),
    disconnectWhatsApp: vi.fn(),
    logoutConfirmOpen: false,
    setLogoutConfirmOpen: vi.fn(),
    qrKey: 0,
    refreshQr: vi.fn(),
  };

  return { ...workspace, ...overrides } as unknown as never;
}
