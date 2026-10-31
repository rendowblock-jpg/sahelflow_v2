"use client";

import { useIngressHealthSnapshot } from "@/hooks/inbox/ingress-health-store";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxHealthViewRuntimeTranslation } from "@/lib/i18n/inbox-health-view-runtime";
import { deriveIngressHealthView } from "@/lib/inbox/ingress-health-view";

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
  const days = note.hours >= 48 ? Math.floor(note.hours / 24) : 0;
  const template =
    getInboxHealthViewRuntimeTranslation(
      locale,
      days > 0 ? "inboxHealth.silent.days" : "inboxHealth.silent.hours",
    ) ?? "";
  const text = template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(name === "days" ? days : note.hours),
  );
  return (
    <span data-inbox-link-silent-note="" className="text-xs text-muted-foreground">
      {text}
    </span>
  );
}
