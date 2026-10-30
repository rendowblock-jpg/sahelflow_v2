"use client";

import { useEffect, useState } from "react";

import { dockState, draftDomId, type ThreadOrderDraft } from "@/components/inbox/inbox-order-draft-model";
import { SignalShape } from "@/components/inbox/inbox-signal-shape";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";

/**
 * Pin bar above the composer: appears only when a pending draft's card has scrolled out of view.
 * Without IntersectionObserver it stays hidden (the card and the jump button still work).
 */
export function OrderDraftDock({
  draft,
  onReview,
}: {
  draft: ThreadOrderDraft | null;
  onReview: (domId: string) => void;
}) {
  const { t, locale } = useI18n();
  const [seen, setSeen] = useState<{ id: string; visible: boolean } | null>(null);
  const domId = draft ? draftDomId(draft.anchorMessageId) : null;
  const status = draft?.status;

  useEffect(() => {
    if (!domId || status !== "pending" || typeof IntersectionObserver === "undefined") return;
    const target = document.getElementById(domId);
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setSeen({ id: domId, visible: last.isIntersecting });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [domId, status]);

  const cardVisible = seen && seen.id === domId ? seen.visible : null;
  const state = dockState({ draft, cardVisible });
  if (!state.visible || !domId) return null;
  return (
    <div data-order-draft-dock="" className="mb-2">
      <button
        type="button"
        onClick={() => onReview(domId)}
        className="flex min-h-11 w-full items-center gap-2 rounded-control border border-dashed border-foreground/60 bg-card px-3 text-start text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SignalShape shape="diamond" />
        <span className="min-w-0 flex-1">
          {t("inbox.thread.dock.text", { total: formatDZD(state.total, locale) })}
        </span>
      </button>
    </div>
  );
}
