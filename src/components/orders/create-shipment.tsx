"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Truck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,

} from "lucide-react";
import { useRouter } from "next/navigation";
import { mutatePrefix } from "@/lib/swr/mutate";
import { useI18n } from "@/hooks/use-i18n";
import { getBrandIcon } from "@/components/brand/brand-icons";
import { useDeliveryFeeQuote } from "@/components/deliveries/use-delivery-fee-quote";
import { deliveryProviderConfig } from "@/lib/shared";
// Registry-driven provider list (R3-d): DELIVERY_PROVIDERS is the canonical
// union that keys the server-side adapter REGISTRY. The registry index module
// is `server-only`, so the client imports the same const from the shared
// types module — one authority, no hardcoded provider list.
import { DELIVERY_PROVIDERS } from "@/lib/integrations/delivery/types";
import { formatDZD } from "@/lib/utils";

interface CreateShipmentProps {
  orderId: string;
  orderStatus: string;
  /** Existing delivery (if any) so we can show tracking + sync. */
  delivery?: {
    id: string;
    provider: string;
    trackingNumber: string | null;
    labelUrl: string | null;
    cost: number | null;
    status: string;
  } | null;
}

export function CreateShipment({ orderId, orderStatus, delivery }: CreateShipmentProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [provider, setProvider] = useState<string>(DELIVERY_PROVIDERS[0]);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const canCreate = orderStatus === "confirmed" && !delivery?.trackingNumber;

  // Per-wilaya fee preview (d4 fix #8): the estimate is fetched only while the
  // courier select is visible. Provider-capability certification ("fees") is
  // enforced server-side by /api/delivery/estimate — an uncertified provider
  // simply yields no preview and never blocks booking.
  const feeQuote = useDeliveryFeeQuote({
    orderId,
    provider,
    enabled: canCreate,
  });

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/delivery/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, provider }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; delivery?: { trackingNumber: string }; labelUrl?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? t("orders.shipment.createFailed"));
      }
      setResult(t("orders.shipment.createdResult", { tracking: data.delivery?.trackingNumber ?? "" }));
      router.refresh();
      // Invalidate SWR caches so list views reflect the new delivery + order status.
      void mutatePrefix("/api/orders");
      void mutatePrefix("/api/deliveries");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("orders.shipment.errorFallback"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSync() {
    if (!delivery) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/delivery/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: delivery.id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; status?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? t("orders.shipment.syncFailed"));
      }
      setResult(t("orders.shipment.updatedResult", { status: data.status ?? "" }));
      router.refresh();
      // Invalidate SWR caches so list views reflect the updated delivery status.
      void mutatePrefix("/api/orders");
      void mutatePrefix("/api/deliveries");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("orders.shipment.errorFallback"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4" />
          {t("orders.shipment.title")}
        </CardTitle>
        <CardDescription>
          {delivery?.trackingNumber
            ? t("orders.shipment.descTracking")
            : t("orders.shipment.descCreate")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create shipment */}
        {!delivery?.trackingNumber && (
          <>
            {canCreate ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="provider">{t("orders.shipment.carrier")}</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_PROVIDERS.map((registryProvider) => {
                        const BrandIcon = getBrandIcon(registryProvider);
                        return (
                          <SelectItem key={registryProvider} value={registryProvider}>
                            <span className="inline-flex items-center gap-1.5">
                              {BrandIcon ? (
                                <BrandIcon
                                  className="size-4 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {deliveryProviderConfig[registryProvider]?.label ??
                                registryProvider}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("orders.shipment.configureCredentialsHint")}
                  </p>
                  {feeQuote.fee !== null && feeQuote.wilaya ? (
                    <p
                      className="text-xs text-muted-foreground"
                      data-delivery-fee-estimate
                    >
                      {t("deliveries.fee.estimate", {
                        wilaya: feeQuote.wilaya,
                        fee: formatDZD(feeQuote.fee, locale),
                      })}
                    </p>
                  ) : null}
                </div>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                      {t("orders.shipment.creating")}
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4 me-1.5" />
                      {t("orders.shipment.create")}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {orderStatus === "draft"
                  ? t("orders.shipment.mustConfirmFirst")
                  : orderStatus === "shipped" || orderStatus === "delivered"
                    ? t("orders.shipment.alreadyCreated")
                    : t("orders.shipment.notShippable")}
              </p>
            )}
          </>
        )}

        {/* Sync tracking */}
        {delivery?.trackingNumber && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("orders.shipment.carrier")}</span>
                <span className="font-medium">
                  {deliveryProviderConfig[delivery.provider]?.label ?? delivery.provider}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("orders.shipment.tracking")}</span>
                <span className="font-mono text-xs">{delivery.trackingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.status")}</span>
                <span>{delivery.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? (
                  <>
                    <Loader2 className="h-3 w-3 me-1.5 animate-spin" />
                    {t("orders.shipment.syncing")}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 me-1.5" />
                    {t("orders.shipment.syncTracking")}
                  </>
                )}
              </Button>
              {delivery?.labelUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={delivery.labelUrl} target="_blank" rel="noopener noreferrer">
                    <Printer className="h-3 w-3 me-1.5" />
                    {t("orders.shipment.printLabel")}
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Feedback */}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className="flex items-start gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{result}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
