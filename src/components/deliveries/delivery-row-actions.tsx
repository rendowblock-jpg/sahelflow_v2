"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink, Eye } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";

interface DeliveryRowActionsProps {
  deliveryId: string;
  provider: string;
  trackingNumber: string | null;
  orderId?: string | null;
}

/**
 * Per-provider tracking page URLs. Most Algerian delivery providers expose a
 * public tracking page rather than a deep-linkable URL, so we point the user
 * to the page where they can enter their tracking number. Falls back to a
 * Google search for unknown providers.
 */
const PROVIDER_TRACKING_URLS: Record<string, string> = {
  yalidine: "https://suivi.yalidine.app/",
  maystro: "https://www.maystro-delivery.com/",
  zrexpress: "https://zrexpress.com/",
};

function getTrackingUrl(provider: string, trackingNumber: string): string {
  const base = PROVIDER_TRACKING_URLS[provider];
  if (base) return base;
  return `https://www.google.com/search?q=${encodeURIComponent(`${provider} tracking ${trackingNumber}`)}`;
}

/**
 * DeliveryRowActions — Sync + Track actions for a single delivery row.
 *
 * Sync calls POST /api/delivery/sync to refresh the status from the provider
 * (and update the order if delivered). Track opens the provider's tracking
 * page in a new tab. Rendered inside the server-component deliveries table.
 */
export function DeliveryRowActions({
  deliveryId,
  provider,
  trackingNumber,
}: DeliveryRowActionsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/delivery/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(t("deliveries.syncSuccess"));
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("deliveries.syncFailed"),
      );
    } finally {
      setSyncing(false);
    }
  }

  const trackUrl = trackingNumber ? getTrackingUrl(provider, trackingNumber) : null;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleSync}
        disabled={syncing || !trackingNumber}
        title={t("deliveries.sync")}
        aria-label={t("deliveries.sync")}
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
      </Button>
      {trackUrl ? (
        <Button variant="ghost" size="icon-sm" asChild title={t("deliveries.track")} aria-label={t("deliveries.track")}>
          <Link href={trackUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-sm" asChild title={t("common.view") || "View"} aria-label={t("common.view") || "View"}>
        <Link href={`/deliveries/${deliveryId}`}>
          <Eye className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
