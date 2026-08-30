"use client";

import useSWR from "swr";

import { fetcher } from "@/lib/swr/fetcher";

/**
 * Global inbox liveness summary (R4-a).
 *
 * The inbox workspace owns the rich conversation projection; every surface
 * OUTSIDE the inbox (sidebar badge, new-message toast/sound) only needs the
 * unread truth. This hook polls the cheap read-only summary route on the same
 * `unreadCount` column the inbox queue renders, so the global badge can never
 * disagree with the inbox about what is unread.
 *
 * Cadence: 15s refresh, paused while the document is hidden (SWR default
 * `refreshWhenHidden: false`) and revalidated on focus — the seller returning
 * to SahelFlow sees the badge catch up immediately instead of waiting for the
 * next tick. Errors resolve to "no signal" (0) rather than a wrong number.
 */
export const INBOX_UNREAD_SUMMARY_KEY = "/api/conversations/unread-summary";

const INBOX_UNREAD_REFRESH_MS = 15_000;

export interface InboxUnreadLatest {
  conversationId: string;
  name: string | null;
  preview: string | null;
  unread: number;
}

export interface InboxUnreadSummary {
  /** Total unread inbound messages across inbox conversations (WhatsApp-style). */
  total: number;
  /** How many conversations carry at least one unread message. */
  conversations: number;
  /** Newest unread conversation, for the new-message toast. Null when caught up. */
  latest: InboxUnreadLatest | null;
}

const EMPTY_SUMMARY: InboxUnreadSummary = {
  total: 0,
  conversations: 0,
  latest: null,
};

export function useInboxUnread() {
  const { data, error, isLoading, mutate } = useSWR<InboxUnreadSummary>(
    INBOX_UNREAD_SUMMARY_KEY,
    fetcher,
    {
      refreshInterval: INBOX_UNREAD_REFRESH_MS,
      revalidateOnFocus: true,
      // SWR pauses the interval while the tab is hidden by default; keep the
      // intent explicit so a future global config cannot wake background
      // polling on an idle desktop.
      refreshWhenHidden: false,
      keepPreviousData: true,
      // A failed poll keeps the last known count on screen instead of
      // flashing the badge away on a single network hiccup.
      shouldRetryOnError: true,
    },
  );

  return {
    summary: data ?? EMPTY_SUMMARY,
    total: data?.total ?? 0,
    conversations: data?.conversations ?? 0,
    latest: data?.latest ?? null,
    error: error ?? null,
    isLoading: isLoading && data === undefined,
    mutate,
  };
}
