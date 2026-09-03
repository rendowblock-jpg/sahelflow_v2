import type { ConversationWorkflowState } from "@/components/inbox/conversation-controls";
import type {
  IncomingMessage,
  WhatsAppStatus,
  WhatsAppUser,
} from "@/lib/whatsapp/types";

export type InboxQueueFilter =
  | "all"
  | "unread"
  | "open"
  | "pending"
  | "resolved"
  | "archived";

export type InboxChatChannel = "whatsapp" | "conversation";

export interface InboxChat {
  /** Stable UI key. WhatsApp rows keep their provider JID so push events match. */
  id: string;
  /** Canonical persisted conversation row used for workflow/collaboration actions. */
  conversationId: string;
  /** Provider address used only for WhatsApp transport/history endpoints. */
  transportId?: string;
  name: string;
  phone?: string;
  channel: InboxChatChannel;
  lastMessageText?: string;
  lastMessageAt?: number;
  /** True when the newest message was sent by the operator ("You: " preview). */
  lastMessageFromMe?: boolean;
  /** Media family of the newest message (image/video/audio/document/…). */
  lastMessageType?: string | null;
  unread: number;
  // Ledger INB-12: WhatsApp conversation states (server-projected truth).
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  workflow: Partial<ConversationWorkflowState>;
}

export interface InboxMessage {
  id: string;
  body: string;
  direction: "inbound" | "outbound" | "system";
  timestamp: number;
  messageType?: string;
  deliveryStatus?: "sending" | "sent" | "delivered" | "read" | "failed";
  outboxEffectKey?: string;
  outboxState?:
    | "queued"
    | "processing"
    | "retrying"
    | "succeeded"
    | "ambiguous"
    | "dead_letter";
  /** Coded outbox rejection (OutboxIntent.lastErrorCode), for truthful retry affordances. */
  outboxErrorCode?: string | null;
  attachment?: IncomingMessage["attachment"];
  /** Canonical message this message quotes (#317 quoted replies). */
  quotedMessageId?: string | null;
  /** Server-resolved visible context for the quoted target, when known. */
  quoted?: {
    fromMe: boolean;
    preview: string;
    messageType?: string | null;
  } | null;
}

/** Transient client-side upload state for one in-flight media send. */
export interface InboxUploadState {
  /** 0-100 byte progress while the browser request is still in flight. */
  progress: number;
  /** True only while cancellation can still guarantee a pre-effect abort. */
  cancellable: boolean;
}

export interface InboxTransportState {
  reachable: boolean | null;
  status: WhatsAppStatus | null;
  user: WhatsAppUser | null;
  wsOpen: boolean;
}
