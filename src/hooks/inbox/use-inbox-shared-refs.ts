"use client";

import { useRef } from "react";

import type {
  InboxChat,
  InboxMessage,
} from "@/components/inbox/inbox-workspace-types";

/**
 * INB-27 — refs shared across the Inbox workspace sub-hooks.
 *
 * These refs are read and written by more than one concern (chat queue,
 * thread, drafts, outbox, transport), so they are created once at the
 * composition root and injected. Single-concern refs stay private to their
 * owning hook.
 */
export interface InboxSharedRefs {
  /** The active chat object, kept in sync outside the render cycle. */
  activeChatRef: React.RefObject<InboxChat | null>;
  /** Transport jid of the active chat ("whatsapp" channel only). */
  activeTransportIdRef: React.RefObject<string | null>;
  /** Mirror of the live thread projection for pre-render mutations. */
  messagesRef: React.RefObject<InboxMessage[]>;
  /** Bumped to invalidate any in-flight message load. */
  messageLoadGenerationRef: React.RefObject<number>;
  /** Bumped on selection changes to reject stale projections. */
  messageSelectionGenerationRef: React.RefObject<number>;
  /** Serializes the shared send gate across text and media sends. */
  sendingRef: React.RefObject<boolean>;
  /** Conversations held unread against automatic mark-read. */
  explicitUnreadHoldRef: React.RefObject<Set<string>>;
}

export function useInboxSharedRefs(): InboxSharedRefs {
  const activeChatRef = useRef<InboxChat | null>(null);
  const activeTransportIdRef = useRef<string | null>(null);
  const messagesRef = useRef<InboxMessage[]>([]);
  const messageLoadGenerationRef = useRef(0);
  const messageSelectionGenerationRef = useRef(0);
  const sendingRef = useRef(false);
  const explicitUnreadHoldRef = useRef(new Set<string>());

  return {
    activeChatRef,
    activeTransportIdRef,
    messagesRef,
    messageLoadGenerationRef,
    messageSelectionGenerationRef,
    sendingRef,
    explicitUnreadHoldRef,
  };
}
