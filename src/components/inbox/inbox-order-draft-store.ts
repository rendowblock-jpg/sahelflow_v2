import { useSyncExternalStore } from "react";

import type { ThreadOrderDraft } from "@/components/inbox/inbox-order-draft-model";

/*
 * The AI read of an order is not stored by the server: it lives here, one draft per
 * conversation, until the page is reloaded. The UI never says otherwise.
 */
const EMPTY: readonly ThreadOrderDraft[] = [];
let drafts: readonly ThreadOrderDraft[] = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeOrderDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOrderDraftsSnapshot(): readonly ThreadOrderDraft[] {
  return drafts;
}

export function registerOrderDraft(draft: ThreadOrderDraft): void {
  drafts = [...drafts.filter((entry) => entry.conversationId !== draft.conversationId), draft];
  emit();
}

export function updateOrderDraft(conversationId: string, patch: Partial<ThreadOrderDraft>): void {
  drafts = drafts.map((entry) => (entry.conversationId === conversationId ? { ...entry, ...patch } : entry));
  emit();
}

export function resetOrderDraftsForTests(): void {
  drafts = EMPTY;
  emit();
}

export function useOrderDrafts(): readonly ThreadOrderDraft[] {
  return useSyncExternalStore(subscribeOrderDrafts, getOrderDraftsSnapshot, () => EMPTY);
}
