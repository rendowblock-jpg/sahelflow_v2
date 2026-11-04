import type { InboxChat } from "@/components/inbox/inbox-workspace-types";
import {
  conversationAvatarInitial,
  conversationDisplayPhone,
  conversationTitleParts,
  type TitleParts,
} from "@/lib/inbox/conversation-title";

/**
 * F-0028: every Inbox surface titles a conversation through these three
 * functions, never from `chat.name` directly (the stored name can be the raw
 * WhatsApp id). The provider address is read for classification only.
 */
type ChatTitleSource = Pick<InboxChat, "id" | "name" | "phone" | "sourceId" | "transportId">;

function addressOf(chat: ChatTitleSource): string | null {
  return chat.sourceId ?? chat.transportId ?? chat.id ?? null;
}

export function inboxChatTitleParts(chat: ChatTitleSource, locale: string): TitleParts {
  return conversationTitleParts({ name: chat.name, sourceId: addressOf(chat), locale });
}

export function inboxChatTitle(chat: ChatTitleSource, locale: string): string {
  return inboxChatTitleParts(chat, locale).text;
}

/** `null` = show the person glyph. */
export function inboxChatInitial(chat: ChatTitleSource, locale: string): string | null {
  return conversationAvatarInitial({ name: chat.name, sourceId: addressOf(chat), locale });
}

export function inboxChatPhone(chat: ChatTitleSource, locale: string): string | null {
  return conversationDisplayPhone({ phone: chat.phone, sourceId: addressOf(chat), locale });
}
