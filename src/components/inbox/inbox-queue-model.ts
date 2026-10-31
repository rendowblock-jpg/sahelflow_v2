import type { InboxChat } from "@/components/inbox/inbox-workspace-types";
import type { ConversationStatus } from "@/lib/data/conversation-service";

/** The list request size (use-inbox-chat-queue.ts: /api/whatsapp/chats?limit=100). */
export const INBOX_CHAT_FETCH_LIMIT = 100;

/** Signal shapes: diamond needs you, dot ok, triangle failed, ring neutral. */
export const CHIP_SHAPES = ["diamond", "dot", "triangle", "ring"] as const;
export type ChipShape = (typeof CHIP_SHAPES)[number];

export interface RowChip {
  shape: ChipShape;
  labelKey: string;
}

/** One table: conversation status -> shape + label. A new status must be added here. */
export const INBOX_ROW_CHIPS: Readonly<Record<ConversationStatus, RowChip>> &
  Readonly<Record<string, RowChip | undefined>> = {
  open: { shape: "ring", labelKey: "inbox.carnet.chip.open" },
  pending: { shape: "diamond", labelKey: "inbox.carnet.chip.pending" },
  resolved: { shape: "dot", labelKey: "inbox.carnet.chip.resolved" },
  snoozed: { shape: "ring", labelKey: "inbox.carnet.chip.snoozed" },
};

const DRAFT_CHIP: RowChip = { shape: "diamond", labelKey: "inbox.carnet.chip.draft" };

/** A reply waiting in the composer needs the seller whatever the status says. */
export function rowChipFor(input: { status: string; hasDraft: boolean }): RowChip {
  if (input.hasDraft) return DRAFT_CHIP;
  return INBOX_ROW_CHIPS[input.status] ?? INBOX_ROW_CHIPS.open;
}

export type ListFooter =
  | { kind: "empty"; loaded: 0; total: null }
  | { kind: "loaded-only" | "capped"; loaded: number; total: null }
  | { kind: "of-total"; loaded: number; total: number };

/** Prints a total only when the caller really has one (the client request returns none). */
export function deriveListFooter(input: {
  loaded: number;
  total: number | null;
}): ListFooter {
  const loaded =
    Number.isFinite(input.loaded) && input.loaded > 0 ? Math.floor(input.loaded) : 0;
  if (loaded === 0) return { kind: "empty", loaded: 0, total: null };
  const total = input.total;
  if (typeof total === "number" && Number.isInteger(total) && total >= loaded) {
    return { kind: "of-total", loaded, total };
  }
  return {
    kind: loaded >= INBOX_CHAT_FETCH_LIMIT ? "capped" : "loaded-only",
    loaded,
    total: null,
  };
}

/** Counts behind the tabs; archived rows count only in the archive tab. */
export function tabCounts(chats: readonly InboxChat[], currentMemberId: string | null) {
  const active = chats.filter((chat) => !chat.archived);
  return {
    mine: currentMemberId
      ? active.filter((chat) => chat.workflow.assigneeId === currentMemberId).length
      : 0,
    unassigned: active.filter((chat) => !chat.workflow.assigneeId).length,
    unread: active.filter((chat) => chat.unread > 0).length,
    all: active.length,
    archived: chats.length - active.length,
  };
}
