"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  PackagePlus,
  RefreshCw,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import { ReasonCodeField } from "@/components/orders/reason-code-field";
import { deliveryProviderLabel } from "@/lib/shared";
import { mutatePrefix } from "@/lib/swr/mutate";
import { deliveryStatusI18nKey } from "@/lib/shared/status-colors";
import { DZ_CLOCK, formatDZD, intlLocale } from "@/lib/utils";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";

const PROVIDERS = ["yalidine", "maystro", "zrexpress", "ecotrack"] as const;
const PROVIDER_LABELS: Record<(typeof PROVIDERS)[number], string> = {
  yalidine: "Yalidine",
  maystro: "Maystro Delivery",
  zrexpress: "ZR Express",
  ecotrack: "EcoTrack Pro",
};
type Provider = (typeof PROVIDERS)[number];
type Action = "book" | "sync" | "reconcile_created" | "reconcile_not_created";

interface CourierPosition {
  orderId: string;
  orderVersion: number;
  orderStatus: string;
  fulfillmentState: string | null;
  deliveryState: string | null;
  inventoryState: string | null;
  codState: string | null;
  delivery: null | {
    id: string;
    provider: string;
    trackingNumber: string | null;
    labelUrl: string | null;
    cost: number | null;
    status: string;
    estimatedDelivery: string | null;
  };
  effect: null | {
    effectKey: string;
    state: string;
    attemptCount: number;
    nextAttemptAt: string | null;
    errorCode: string | null;
    requiresReconciliation: boolean;
  };
  availableActions: Action[];
}

const COPY = {
  en: {
    authority: "Courier",
    heading: "Courier booking and tracking",
    provider: "Courier provider",
    book: "Book shipment",
    sync: "Sync tracking",
    queued: "Shipment request sent to the courier.",
    synced: "Tracking updated.",
    replayed: "This was already saved.",
    failed: "The courier request did not go through. Refresh and try again.",
    delivery: "Courier status",
    tracking: "Tracking number",
    cost: "Courier cost",
    estimated: "Estimated delivery",
    label: "Open label",
    noTracking: "No shipment has been created with a courier yet.",
    ambiguousTitle: "Check whether the shipment was created",
    ambiguousBody:
      "The courier may have created the shipment even though no answer came back. Check your courier dashboard before booking again.",
    trackingInput: "Tracking number shown in your courier dashboard",
    reason: "Reconciliation reason code",
    confirmCreated: "Confirm shipment exists",
    confirmMissing: "Confirm no shipment exists",
    reconciled: "Shipment status confirmed.",
    attempts: "Attempts",
    nextRetry: "Next automatic retry",
    loading: "Loading courier details…",
  },
  fr: {
    authority: "Transporteur",
    heading: "Réservation et suivi transporteur",
    provider: "Transporteur",
    book: "Créer l'expédition",
    sync: "Synchroniser le suivi",
    queued: "Demande d’expédition envoyée au transporteur.",
    synced: "Suivi mis à jour.",
    replayed: "C’était déjà enregistré.",
    failed: "La demande au transporteur n’a pas abouti. Actualisez puis réessayez.",
    delivery: "Statut transporteur",
    tracking: "Numéro de suivi",
    cost: "Coût transporteur",
    estimated: "Livraison estimée",
    label: "Ouvrir l'étiquette",
    noTracking: "Aucune expédition n’a encore été créée chez un transporteur.",
    ambiguousTitle: "Vérifiez si l’expédition a été créée",
    ambiguousBody:
      "Le transporteur a peut-être créé l’expédition même sans réponse. Vérifiez votre espace transporteur avant de réessayer.",
    trackingInput: "Numéro de suivi affiché dans votre espace transporteur",
    reason: "Code motif du rapprochement",
    confirmCreated: "Confirmer que l'expédition existe",
    confirmMissing: "Confirmer qu'elle n'existe pas",
    reconciled: "Statut de l’expédition confirmé.",
    attempts: "Tentatives",
    nextRetry: "Prochaine tentative automatique",
    loading: "Chargement du transporteur…",
  },
  ar: {
    authority: "شركة التوصيل",
    heading: "حجز الشحنة وتتبعها",
    provider: "شركة التوصيل",
    book: "إنشاء الشحنة",
    sync: "مزامنة التتبع",
    queued: "أُرسل طلب الشحن إلى شركة التوصيل.",
    synced: "تم تحديث التتبع.",
    replayed: "سبق حفظ ذلك.",
    failed: "لم يتم طلب شركة التوصيل. حدّث الصفحة ثم أعد المحاولة.",
    delivery: "حالة شركة التوصيل",
    tracking: "رقم التتبع",
    cost: "تكلفة التوصيل",
    estimated: "موعد التسليم المتوقع",
    label: "فتح الملصق",
    noTracking: "لم تُنشأ شحنة لدى أي شركة توصيل بعد.",
    ambiguousTitle: "تحقّق مما إذا أُنشئت الشحنة",
    ambiguousBody:
      "ربما أنشأت شركة التوصيل الشحنة رغم عدم وصول رد. تحقّق من لوحة شركة التوصيل قبل إعادة الحجز.",
    trackingInput: "رقم التتبع الظاهر في لوحة شركة التوصيل",
    reason: "رمز سبب المطابقة",
    confirmCreated: "تأكيد وجود الشحنة",
    confirmMissing: "تأكيد عدم إنشاء الشحنة",
    reconciled: "تم تأكيد حالة الشحنة.",
    attempts: "عدد المحاولات",
    nextRetry: "المحاولة التلقائية التالية",
    loading: "جارٍ تحميل تفاصيل شركة التوصيل…",
  },
} as const;

async function fetcher(url: string): Promise<{ position: CourierPosition }> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Courier position failed");
  return body as { position: CourierPosition };
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    ...DZ_CLOCK,
  }).format(new Date(value));
}

export function CanonicalCourierActions({ orderId }: { orderId: string }) {
  const { locale, t } = useI18n();
  const copy = COPY[locale];
  const endpoint = `/api/orders/${orderId}/courier`;
  const { data, error: loadError, isLoading, mutate } = useSWR(endpoint, fetcher);
  const position = data?.position;
  const [provider, setProvider] = useState<Provider>("yalidine");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [reasonCode, setReasonCode] = useState("provider_dashboard_checked");
  const [loadingAction, setLoadingAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commandKey(action: Action): string {
    const version = position?.orderVersion ?? 0;
    const storageKey = `sf-courier:${orderId}:${version}:${action}`;
    const previous = window.localStorage.getItem(storageKey);
    if (previous && previous.length >= 8) return previous;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  }

  async function refresh(): Promise<void> {
    await mutate();
    await mutatePrefix("/api/orders");
  }

  async function book(): Promise<void> {
    if (!position) return;
    setLoadingAction("book");
    setError(null);
    setNotice(null);
    const idempotencyKey = commandKey("book");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          expectedVersion: position.orderVersion,
          idempotencyKey,
          correlationId: `courier-ui:${idempotencyKey}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? copy.failed);
      setNotice(body.command?.replayed ? copy.replayed : copy.queued);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : copy.failed);
    } finally {
      setLoadingAction(null);
    }
  }

  async function sync(): Promise<void> {
    setLoadingAction("sync");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${endpoint}/sync`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? copy.failed);
      setNotice(copy.synced);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : copy.failed);
    } finally {
      setLoadingAction(null);
    }
  }

  async function reconcile(action: "reconcile_created" | "reconcile_not_created") {
    if (!position) return;
    setLoadingAction(action);
    setError(null);
    setNotice(null);
    const idempotencyKey = commandKey(action);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:
            action === "reconcile_created"
              ? "confirm_created"
              : "confirm_not_created",
          expectedVersion: position.orderVersion,
          trackingNumber:
            action === "reconcile_created" ? trackingNumber.trim() : undefined,
          reasonCode: reasonCode.trim(),
          idempotencyKey,
          correlationId: `courier-reconciliation-ui:${idempotencyKey}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? copy.failed);
      setNotice(body.command?.replayed ? copy.replayed : copy.reconciled);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : copy.failed);
    } finally {
      setLoadingAction(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {copy.loading}
      </div>
    );
  }
  if (loadError || !position) return null;

  const canBook = position.availableActions.includes("book");
  const canSync = position.availableActions.includes("sync");
  const ambiguous = position.effect?.requiresReconciliation ?? false;
  const delivery = position.delivery;
  if (!canBook && !canSync && !ambiguous && !delivery) return null;

  return (
    <section className="space-y-4 border-t pt-5" aria-labelledby={`courier-${orderId}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={`courier-${orderId}`} className="text-sm font-medium">
            {copy.heading}
          </h3>
        </div>
        {canSync ? (
          <Button size="sm" variant="outline" onClick={() => void sync()} disabled={loadingAction !== null}>
            {loadingAction === "sync" ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="me-1.5 h-4 w-4" />
            )}
            {copy.sync}
          </Button>
        ) : null}
      </div>

      {canBook ? (
        <div className="grid gap-3 rounded-surface border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor={`courier-provider-${orderId}`}>{copy.provider}</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as Provider)}>
              <SelectTrigger id={`courier-provider-${orderId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {PROVIDER_LABELS[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void book()} disabled={loadingAction !== null}>
            {loadingAction === "book" ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <PackagePlus className="me-1.5 h-4 w-4" />
            )}
            {copy.book}
          </Button>
        </div>
      ) : null}

      {delivery ? (
        <dl className="grid grid-cols-2 gap-3 rounded-surface bg-muted/40 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{copy.provider}</dt>
            <dd className="font-medium" dir="auto">
              {deliveryProviderLabel(delivery.provider, t)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.delivery}</dt>
            <dd className="font-medium" dir="auto">{t(deliveryStatusI18nKey(delivery.status))}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.tracking}</dt>
            <dd className="font-medium" dir="auto">{delivery.trackingNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.cost}</dt>
            <dd className="font-medium">{delivery.cost === null ? "—" : formatDZD(delivery.cost, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.estimated}</dt>
            <dd className="font-medium">{formatDate(delivery.estimatedDelivery, locale)}</dd>
          </div>
          {delivery.labelUrl ? (
            <div>
              <dt className="text-xs text-muted-foreground">{copy.label}</dt>
              <dd>
                <a
                  href={delivery.labelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                >
                  {copy.label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </dd>
            </div>
          ) : null}
          {position.effect ? (
            <>
              <div>
                <dt className="text-xs text-muted-foreground">{copy.attempts}</dt>
                <dd className="font-medium">{position.effect.attemptCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{copy.nextRetry}</dt>
                <dd className="font-medium">{formatDate(position.effect.nextAttemptAt, locale)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noTracking}</p>
      )}

      {ambiguous ? (
        <div className="space-y-3 rounded-surface border border-warning/40 bg-warning-soft p-3">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">{copy.ambiguousTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copy.ambiguousBody}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`courier-tracking-${orderId}`}>{copy.trackingInput}</Label>
              <Input
                id={`courier-tracking-${orderId}`}
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                dir="auto"
              />
            </div>
            <ReasonCodeField
              id={`courier-reason-${orderId}`}
              context="courier"
              locale={locale}
              value={reasonCode}
              onChange={setReasonCode}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void reconcile("reconcile_created")}
              disabled={loadingAction !== null || !trackingNumber.trim() || !reasonCode.trim()}
            >
              {loadingAction === "reconcile_created" ? (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Truck className="me-1.5 h-4 w-4" />
              )}
              {copy.confirmCreated}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void reconcile("reconcile_not_created")}
              disabled={loadingAction !== null || !reasonCode.trim()}
            >
              {copy.confirmMissing}
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? <p className="text-sm text-success" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
