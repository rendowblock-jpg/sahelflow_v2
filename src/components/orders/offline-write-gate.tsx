"use client";

import * as React from "react";

import { resolveWriteGate } from "@/components/orders/write-gate";
import { StateView } from "@/components/shared/state-view";
import { useI18n } from "@/hooks/use-i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * The sentence every offline-disabled write control gives as its reason, plus whether writes are off.
 * Use it where a control takes its own `disabled` prop (Radix triggers open on pointerdown, so a native
 * fieldset alone would not stop them).
 */
export function useOfflineWrites(): { offline: boolean; reason: string | undefined } {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const gate = resolveWriteGate({ online, allowed: true });
  return { offline: gate.reason === "offline", reason: gate.reason === "offline" ? t("ordersDetail.offline.reason") : undefined };
}

/**
 * Wraps a cluster of write controls. Offline, a native disabled fieldset switches off every button and field
 * inside it, and the reason is the tooltip and the group's accessible description (never a silent dead button).
 * `contents` keeps the layout of the children unchanged.
 */
export function OfflineWriteGate({ children, className }: { children: React.ReactNode; className?: string }) {
  const { offline, reason } = useOfflineWrites();
  const reasonId = React.useId();
  if (!offline) {
    return <fieldset className={className ?? "contents"}>{children}</fieldset>;
  }
  return (
    <fieldset disabled title={reason} aria-describedby={reasonId} className={className ?? "contents"}>
      {children}
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </fieldset>
  );
}

/** The thin strip at the top of a detail page while offline: the saved details stay, the writes are paused. */
export function DetailOfflineBanner() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  if (online) return null;
  return <StateView kind="offline" description={t("ordersDetail.offline.banner")} testId="detail-offline-banner" />;
}
