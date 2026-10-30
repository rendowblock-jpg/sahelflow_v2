"use client";

import { useSyncExternalStore } from "react";

import { deriveInboxLinkState, type InboxLinkState } from "@/components/inbox/inbox-link-state";
import { useI18n } from "@/hooks/use-i18n";
import type { useInboxWorkspace } from "@/hooks/use-inbox-workspace";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const readOnline = (): boolean | null => navigator.onLine;
const serverOnline = (): boolean | null => null;

/** The header surface and the composer must never disagree: both feed the same pure function the same signals. */
export function useThreadLinkState(
  workspace: Pick<ReturnType<typeof useInboxWorkspace>, "transport" | "dataDegraded">,
): InboxLinkState {
  const { transport, dataDegraded } = workspace;
  const browserOnline = useSyncExternalStore(subscribeOnline, readOnline, serverOnline);
  return deriveInboxLinkState({
    status: transport.status,
    reachable: transport.reachable,
    wsOpen: transport.wsOpen,
    browserOnline,
    dataDegraded,
  });
}

export function threadSendGate(input: {
  canCompose: boolean;
  link: Pick<InboxLinkState, "blocksSending">;
}): { canSend: boolean; showPausedHint: boolean } {
  return {
    canSend: input.canCompose && !input.link.blocksSending,
    showPausedHint: input.canCompose && input.link.blocksSending,
  };
}

/** One quiet line under the notice in the header: it points there and never repeats the cause. */
export function ThreadPausedHint({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <p data-thread-paused-hint="" className="mb-2 px-1 text-caption text-muted-foreground">
      {t("inbox.thread.pausedHint")}
    </p>
  );
}
