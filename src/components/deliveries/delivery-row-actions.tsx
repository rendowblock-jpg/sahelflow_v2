"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink, Eye, Ban } from "lucide-react";
import { toast } from "@/lib/toast";
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
  noest: "https://noest-dz.com/",
  zrexpress: "https://zrexpress.com/",
};

/**
 * W3-11: providers that don't support API-based cancellation get an
 * "Open Dashboard" cancel affordance instead of a real cancel button.
 *
 * Each entry maps provider → dashboard URL the seller can visit to
 * cancel manually. The ZR Express adapter's cancelShipment returns
 * this same URL structurally (see zr-express.ts), but the UI doesn't
 * need to call the API to know the result — the dashboard URL is a
 * static property of the provider.
 *
 * For providers NOT in this map (Yalidine, Maystro, NOEST), no Cancel
 * button is rendered. A real cancel API endpoint would be needed to
 * wire those up (out of scope for W3-11 — ZR Express is the stub).
 */
const PROVIDER_DASHBOARD_URLS: Record<string, string> = {
  zrexpress: "https://zrexpress.com/ZREXPRESS_WEB/FR/",
};

function getTrackingUrl(provider: string, trackingNumber: string): string {
  const base = PROVIDER_TRACKING_URLS[provider];
  if (base) return base;
  return `https://www.google.com/search?q=${encodeURIComponent(`${provider} tracking ${trackingNumber}`)}`;
}

/**
 * DeliveryRowActions — Sync + Track + Cancel actions for a single delivery row.
 *
 * Sync calls POST /api/delivery/sync to refresh the status from the provider
 * (and update the order if delivered). Track opens the provider's tracking
 * page in a new tab. Cancel opens the provider's dashboard (W3-11: ZR Express
 * does not support API-based cancellation — the seller must cancel manually
 * in the provider's dashboard). Rendered inside the server-component
 * deliveries table.
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

  // W3-11: cancel handler — for providers that don't support API cancellation
  // (ZR Express today), we show a toast with an "Open Dashboard" action button
  // instead of calling a (non-existent) cancel endpoint. The dashboard URL is
  // a static property of the provider (matches the adapter's structured
  // cancelShipment result — see zr-express.ts).
  const dashboardUrl = PROVIDER_DASHBOARD_URLS[provider];
  function handleCancel() {
    if (!dashboardUrl) return; // unreachable — button only renders when set
    toast.warning(t("deliveries.cancelTitle"), {
      description: t("deliveries.cancelZrExpressMessage"),
      duration: 20000, // longer so the user has time to click "Open Dashboard"
      action: {
        label: t("deliveries.cancelOpenDashboard"),
        onClick: () => {
          window.open(dashboardUrl, "_blank", "noopener,noreferrer");
        },
      },
    });
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
      {dashboardUrl ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCancel}
          title={t("deliveries.cancel")}
          aria-label={t("deliveries.cancel")}
        >
          <Ban className="h-4 w-4" />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-sm" asChild title={t("common.view")} aria-label={t("common.view")}>
        <Link href={`/deliveries/${deliveryId}`}>
          <Eye className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
