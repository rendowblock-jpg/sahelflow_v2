"use client";

import { useId, useState } from "react";

import { ExtractionReview, type ReviewedOrder } from "@/components/inbox/extraction/extraction-review";
import { approvalGate, type ThreadOrderDraft } from "@/components/inbox/inbox-order-draft-model";
import { updateOrderDraft } from "@/components/inbox/inbox-order-draft-store";
import { submitReviewedOrder } from "@/components/inbox/message-extraction";
import { OrderDraftCard } from "@/components/inbox/order-draft-card";
import { useI18n } from "@/hooks/use-i18n";
import { getOrderExtractionCopy, type OrderExtractionCopyKey, type OrderExtractionLocale } from "@/lib/i18n/order-extraction";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";

/**
 * Wires the slip to the draft store. Approve calls submitReviewedOrder, the same function the review
 * dialog uses, and only from the button (or the editor's own submit); nothing here runs on its own.
 */
export function ConnectedOrderDraftCard({ draft }: { draft: ThreadOrderDraft }) {
  const { locale } = useI18n();
  const fieldId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const copy = (key: OrderExtractionCopyKey, params?: Record<string, string | number>) =>
    getOrderExtractionCopy(locale as OrderExtractionLocale, key, params);

  async function approve(edited?: ReviewedOrder) {
    const gate = edited ? { ok: true as const, reviewed: edited } : approvalGate(draft.order, draft.catalog, draft.knownPhone);
    if (!gate.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await submitReviewedOrder({
        conversationId: draft.transportId ?? draft.conversationId,
        messageId: draft.anchorMessageId,
        method: draft.method,
        confidence: draft.confidence,
        reviewed: gate.reviewed,
        customerFallbackName: copy("customerTitle"),
        failedText: copy("failed"),
      });
      updateOrderDraft(draft.conversationId, { status: "approved", created });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : copy("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrderDraftCard
      draft={draft}
      busy={busy}
      error={error}
      editor={
        editing ? (
          <ExtractionReview
            order={draft.order}
            knownPhone={draft.knownPhone}
            catalog={draft.catalog}
            locale={locale}
            copy={copy}
            fieldId={fieldId}
            creating={busy}
            onCreate={(reviewed) => void approve(reviewed)}
          />
        ) : null
      }
      onApprove={() => void approve()}
      onEdit={() => setEditing((open) => !open)}
      onDismiss={() => updateOrderDraft(draft.conversationId, { status: "dismissed" })}
      onUndo={() => updateOrderDraft(draft.conversationId, { status: "pending" })}
    />
  );
}
