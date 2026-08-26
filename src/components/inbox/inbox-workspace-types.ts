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
  | "resolved";

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
  unread: number;
  workflow: Partial<ConversationWorkflowState>;
}

export interface InboxMessage {
  id: string;
  /** Canonical local Message.id; provider message IDs remain in `id` when needed for transport reconciliation. */
  canonicalMessageId?: string;
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
  attachment?: IncomingMessage["attachment"];
  mediaState?: IncomingMessage["mediaState"];
}

export interface InboxTransportState {
  reachable: boolean | null;
  status: WhatsAppStatus | null;
  user: WhatsAppUser | null;
  wsOpen: boolean;
}
