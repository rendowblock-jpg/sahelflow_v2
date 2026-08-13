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

import { Badge } from "@/components/ui/badge";
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
import { deliveryProviderConfig } from "@/lib/shared";
import { mutatePrefix } from "@/lib/swr/mutate";

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
    authority: "Canonical courier authority",
    heading: "Courier booking and tracking",
    provider: "Courier provider",
    book: "Book shipment",
    sync: "Sync tracking",
    queued: "Booking queued safely.",
    synced: "Provider tracking synchronized.",
    replayed: "The previously committed action was recovered safely.",
    failed: "The courier action was not committed. Refresh and retry safely.",
    delivery: "Provider state",
    tracking: "Tracking number",
    cost: "Courier cost",
    estimated: "Estimated delivery",
    label: "Open label",
    noTracking: "No provider shipment has been created yet.",
    ambiguousTitle: "Provider outcome requires reconciliation",
    ambiguousBody:
      "The provider request may have succeeded before the response was lost. Do not book again until you check the provider dashboard.",
    trackingInput: "Tracking number confirmed in provider dashboard",
    reason: "Reconciliation reason code",
    confirmCreated: "Confirm shipment exists",
    confirmMissing: "Confirm no shipment exists",
    reconciled: "Courier outcome reconciled.",
    attempts: "Attempts",
    nextRetry: "Next safe retry",
    loading: "Loading courier authority…",
  },
  fr: {
    authority: "Autorité canonique du transporteur",
    heading: "Réservation et suivi transporteur",
    provider: "Transporteur",
    book: "Créer l'expédition",
    sync: "Synchroniser le suivi",
    queued: "Réservation mise en file de manière sûre.",
    synced: "Suivi transporteur synchronisé.",
    replayed: "L'action déjà validée a été récupérée en toute sécurité.",
    failed: "L'action transporteur n'a pas été validée. Actualisez puis réessayez.",
    delivery: "État transporteur",
    tracking: "Numéro de suivi",
    cost: "Coût transporteur",
    estimated: "Livraison estimée",
    label: "Ouvrir l'étiquette",
    noTracking: "Aucune expédition transporteur n'a encore été créée.",
    ambiguousTitle: "Le résultat transporteur doit être rapproché",
    ambiguousBody:
      "La demande a peut-être réussi avant la perte de réponse. Ne recréez pas l'expédition avant de vérifier le tableau de bord transporteur.",
    trackingInput: "Numéro de suivi confirmé chez le transporteur",
    reason: "Code motif du rapprochement",
    confirmCreated: "Confirmer que l'expédition existe",
    confirmMissing: "Confirmer qu'elle n'existe pas",
    reconciled: "Résultat transporteur rapproché.",
    attempts: "Tentatives",
    nextRetry: "Prochaine tentative sûre",
    loading: "Chargement de l'autorité transporteur…",
  },
  ar: {
    authority: "صلاحية شركة التوصيل الموثوقة",
    heading: "حجز الشحنة وتتبعها",
    provider: "شركة التوصيل",
    book: "إنشاء الشحنة",
    sync: "مزامنة التتبع",
    queued: "تم وضع الحجز في الطابور بأمان.",
    synced: "تمت مزامنة تتبع شركة التوصيل.",
    replayed: "تمت استعادة الإجراء المعتمد سابقًا بأمان.",
    failed: "لم يتم اعتماد إجراء شركة التوصيل. حدّث الصفحة ثم أعد المحاولة.",
    delivery: "حالة شركة التوصيل",
    tracking: "رقم التتبع",
    cost: "تكلفة التوصيل",
    estimated: "موعد التسليم المتوقع",
    label: "فتح الملصق",
    noTracking: "لم تُنشأ شحنة لدى شركة التوصيل بعد.",
    ambiguousTitle: "نتيجة شركة التوصيل تحتاج إلى مطابقة",
    ambiguousBody:
      "قد تكون الشحنة أُنشئت قبل ضياع الرد. لا تُنشئ شحنة أخرى قبل التحقق من لوحة شركة التوصيل.",
    trackingInput: "رقم التتبع المؤكد في لوحة شركة التوصيل",
    reason: "رمز سبب المطابقة",
    confirmCreated: "تأكيد وجود الشحنة",
    confirmMissing: "تأكيد عدم إنشاء الشحنة",
    reconciled: "تمت مطابقة نتيجة شركة التوصيل.",
    attempts: "عدد المحاولات",
    nextRetry: "المحاولة الآمنة القادمة",
    loading: "جارٍ تحميل صلاحية شركة التوصيل…",
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
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CanonicalCourierActions({ orderId }: { orderId: string }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const endpoint = `/api/orders/${orderId}/courier`;
  const { data, error: loadError, isLoading, mutate } = useSWR(endpoint, fetcher);
  const position = data?.position;
  const [provider, setProvider] = useState<Provider>("yalidine");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [reasonCode, setReasonCode] = useState("provider-dashboard-checked");
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
      setError(caught instanceof Error ? caught.message : copy.failed);
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
      setError(caught instanceof Error ? caught.message : copy.failed);
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
      setError(caught instanceof Error ? caught.message : copy.failed);
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
          <Badge variant="outline" className="mt-1">
            {copy.authority}
          </Badge>
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
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
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
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{copy.provider}</dt>
            <dd className="font-medium" dir="auto">
              {deliveryProviderConfig[delivery.provider]?.label ?? delivery.provider}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.delivery}</dt>
            <dd className="font-medium" dir="auto">{delivery.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.tracking}</dt>
            <dd className="font-medium" dir="auto">{delivery.trackingNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{copy.cost}</dt>
            <dd className="font-medium">{delivery.cost === null ? "—" : `${delivery.cost} DZD`}</dd>
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
        <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
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
            <div className="space-y-1.5">
              <Label htmlFor={`courier-reason-${orderId}`}>{copy.reason}</Label>
              <Input
                id={`courier-reason-${orderId}`}
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                dir="auto"
              />
            </div>
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
