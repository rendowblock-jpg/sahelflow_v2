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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";

interface CreateShipmentProps {
  orderId: string;
  orderStatus: string;
  /** Existing delivery (if any) so we can show tracking + sync. */
  delivery?: {
    id: string;
    provider: string;
    trackingNumber: string | null;
    cost: number | null;
    status: string;
  } | null;
}

export function CreateShipment({ orderId, orderStatus, delivery }: CreateShipmentProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [provider, setProvider] = useState<string>("yalidine");
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const canCreate = orderStatus === "confirmed" && !delivery?.trackingNumber;

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
                      <SelectItem value="yalidine">📦 Yalidine</SelectItem>
                      <SelectItem value="maystro">🚚 Maystro Delivery</SelectItem>
                      <SelectItem value="zrexpress">📦 ZR Express</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("orders.shipment.configureCredentialsHint")}
                  </p>
                </div>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      {t("orders.shipment.creating")}
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4 mr-1.5" />
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
                <span className="font-medium capitalize">{delivery.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("orders.shipment.tracking")}</span>
                <span className="font-mono text-xs">{delivery.trackingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.status")}</span>
                <span className="capitalize">{delivery.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  {t("orders.shipment.syncing")}
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                  {t("orders.shipment.syncTracking")}
                </>
              )}
            </Button>
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
          <div className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{result}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
