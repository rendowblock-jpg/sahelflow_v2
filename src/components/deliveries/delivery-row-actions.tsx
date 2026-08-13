"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ExternalLink, Eye, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface DeliveryRowActionsProps {
  deliveryId: string;
  provider: string;
  trackingNumber: string | null;
  canManage?: boolean;
  canViewDetail?: boolean;
}

const PROVIDER_TRACKING_URLS: Record<string, string> = {
  yalidine: "https://suivi.yalidine.app/",
  maystro: "https://www.maystro-delivery.com/",
  noest: "https://noest-dz.com/",
  zrexpress: "https://zrexpress.com/",
};
const PROVIDER_DASHBOARD_URLS: Record<string, string> = {
  zrexpress: "https://zrexpress.com/ZREXPRESS_WEB/FR/",
};

function getTrackingUrl(provider: string): string | null {
  return PROVIDER_TRACKING_URLS[provider] ?? null;
}

export function DeliveryRowActions({
  deliveryId,
  provider,
  trackingNumber,
  canManage = false,
  canViewDetail = false,
}: DeliveryRowActionsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (!canManage) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/delivery/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Request failed (${response.status})`);
      }
      toast.success(t("deliveries.syncSuccess"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("deliveries.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  const dashboardUrl = PROVIDER_DASHBOARD_URLS[provider];
  function handleCancel() {
    if (!canManage || !dashboardUrl) return;
    toast.warning(t("deliveries.cancelTitle"), {
      description: t("deliveries.cancelZrExpressMessage"),
      duration: 20_000,
      action: {
        label: t("deliveries.cancelOpenDashboard"),
        onClick: () => window.open(dashboardUrl, "_blank", "noopener,noreferrer"),
      },
    });
  }

  const trackUrl = trackingNumber ? getTrackingUrl(provider) : null;
  return (
    <div className="flex items-center justify-end gap-1">
      {canManage ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleSync}
          disabled={syncing || !trackingNumber}
          title={t("deliveries.sync")}
          aria-label={t("deliveries.sync")}
        >
          <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
        </Button>
      ) : null}
      {trackUrl ? (
        <Button variant="ghost" size="icon-sm" asChild title={t("deliveries.track")}>
          <Link href={trackUrl} target="_blank" rel="noopener noreferrer" aria-label={t("deliveries.track")}>
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      {canManage && dashboardUrl ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCancel}
          title={t("deliveries.cancel")}
          aria-label={t("deliveries.cancel")}
        >
          <Ban className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
      {canViewDetail ? (
        <Button variant="ghost" size="icon-sm" asChild title={t("common.view")}>
          <Link href={`/deliveries/${deliveryId}`} aria-label={t("common.view")}>
            <Eye className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
