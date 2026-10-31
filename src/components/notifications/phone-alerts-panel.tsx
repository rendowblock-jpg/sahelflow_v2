"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { fetchPhoneAlerts, shopClock, type PhoneAlertsStatus } from "@/lib/notifications/phone-alerts-contract";
import { PHONE_ALERTS_AVAILABLE } from "@/lib/notifications/phone-alerts-flag";

type PanelState = { status: "loading" | "ready" | "error"; data: PhoneAlertsStatus | null };

/**
 * "Phone alerts": hidden (renders nothing) until PHONE_ALERTS_AVAILABLE is
 * switched on. Loading, empty, error with Retry (keeps the last data) and
 * "your PC has not been online" are all spelled out.
 */
export function PhoneAlertsPanel({
  available = PHONE_ALERTS_AVAILABLE,
  fetchImpl,
  refreshToken = 0,
}: {
  available?: boolean;
  fetchImpl?: typeof fetch;
  refreshToken?: number;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<PanelState>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!available) return undefined;
    let cancelled = false;
    fetchPhoneAlerts(fetchImpl).then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      () => {
        if (!cancelled) setState((prev) => ({ status: "error", data: prev.data }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [available, fetchImpl, refreshToken, attempt]);
  const retry = () => {
    setState((prev) => ({ status: prev.data ? prev.status : "loading", data: prev.data }));
    setAttempt((value) => value + 1);
  };
  if (!available) return null;
  const { status, data } = state;
  return (
    <section aria-label={t("notifications.phoneAlerts.title")} className="space-y-3 rounded-surface border border-border bg-card p-4">
      <h2 className="text-body font-medium">{t("notifications.phoneAlerts.title")}</h2>
      {status === "loading" && !data ? (
        <div role="status" aria-busy="true" aria-label={t("notifications.phoneAlerts.loading")} data-testid="phone-alerts-skeleton">
          <span className="block h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      ) : null}
      {status === "error" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-body text-destructive">
            {t(data ? "notifications.phoneAlerts.errorKeptData" : "notifications.phoneAlerts.error")}
          </p>
          <Button type="button" className="min-h-11 min-w-11" onClick={retry}>
            {t("notifications.phoneAlerts.retry")}
          </Button>
        </div>
      ) : null}
      {data && data.phones.length === 0 ? <p className="text-body text-muted-foreground">{t("notifications.phoneAlerts.empty")}</p> : null}
      {data && data.phones.length > 0 ? (
        <p className="text-body">
          {t("notifications.phoneAlerts.phones", { count: data.phones.length })}
          {" · "}
          {t(data.enabled ? "notifications.phoneAlerts.on" : "notifications.phoneAlerts.off")}
        </p>
      ) : null}
      {data && !data.pcOnline && data.pcLastOnlineAt ? (
        <p data-testid="phone-alerts-stale" className="text-body text-muted-foreground">
          {t("notifications.phoneAlerts.stale", { time: shopClock(data.pcLastOnlineAt) })}
        </p>
      ) : null}
      <p className="text-caption text-muted-foreground">{t("notifications.phoneAlerts.note")}</p>
    </section>
  );
}
