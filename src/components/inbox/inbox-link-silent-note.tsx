"use client";

import { useIngressHealthSnapshot } from "@/hooks/inbox/ingress-health-store";
import { useI18n } from "@/hooks/use-i18n";
import { deriveIngressHealthView } from "@/lib/inbox/ingress-health-view";
import { silentNoteText } from "@/lib/inbox/silent-note-text";

/** Grey "last customer message" note beside the connection chip. Information only. */
export function InboxLinkSilentNote({ connected }: { connected: boolean }) {
  const { locale } = useI18n();
  const { payload, receivedAt } = useIngressHealthSnapshot();
  const ingress =
    payload && typeof payload === "object" ? (payload as { ingress?: unknown }).ingress : undefined;
  const note = deriveIngressHealthView({
    status: connected ? "connected" : "other",
    ingress,
    now: receivedAt,
  }).silentNote;
  if (!note) return null;
  return (
    <span data-inbox-link-silent-note="" className="text-xs text-muted-foreground">
      {silentNoteText(locale, note.hours)}
    </span>
  );
}
