"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Loader2,
  PackageCheck,
  PackageX,
  RotateCcw,
  SearchCheck,
  Truck,
} from "lucide-react";
import useSWR from "swr";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import type {
  CanonicalOrderRecoveryAction,
  CanonicalReturnDisposition,
} from "@/lib/orders/canonical-order-recovery";

interface RecoveryPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  status: string;
  deliveryState: string | null;
  inventoryState: string | null;
  returnState: string | null;
  returnCase: {
    id: string;
    origin: string;
    currentState: string;
    reasonCode: string;
  } | null;
  items: Array<{
    orderItemId: string;
    productName: string;
    variantName: string | null;
    quantity: number;
  }>;
  availableActions: CanonicalOrderRecoveryAction[];
}

const COPY = {
  en: {
    heading: "Cancellation and physical returns",
    authority: "Governed recovery authority",
    loading: "Loading current recovery authority…",
    noAction: "No cancellation or physical-return action is currently available.",
    loadFailed: "The current recovery position could not be loaded.",
    cancel: "Cancel before shipment",
    delivery_failed: "Delivery failed",
    delivery_refused: "Customer refused",
    return_in_transit: "Return is in transit",
    receive_return: "Receive physical return",
    inspect_return: "Inspect returned goods",
    cancelTitle: "Cancel this order before shipment?",
    cancelBody: "The exact active reservation will be released and available stock restored atomically.",
    delivery_failedTitle: "Record a failed delivery?",
    delivery_failedBody: "Stock remains unavailable until the parcel physically returns and is inspected.",
    delivery_refusedTitle: "Record a customer refusal?",
    delivery_refusedBody: "Stock remains with the carrier until physical return and inspection.",
    return_in_transitTitle: "Mark the parcel as returning?",
    return_in_transitBody: "This records carrier return transit without restoring sellable stock.",
    receive_returnTitle: "Receive the physical parcel?",
    receive_returnBody: "Goods enter inspection quarantine. They are not available for sale yet.",
    inspect_returnTitle: "Complete returned-goods inspection?",
    inspect_returnBody: "Every item must be assigned to available, damaged, quarantine or lost stock.",
    reason: "Reason code",
    reasonPlaceholder: "customer-refused",
    providerEvent: "Provider event ID (optional)",
    providerEventPlaceholder: "Courier event or tracking update ID",
    disposition: "Disposition",
    chooseDisposition: "Choose disposition",
    available: "Available",
    damaged: "Damaged",
    quarantine: "Quarantine",
    lost: "Lost",
    commit: "Commit governed action",
    committed: "The recovery action was committed.",
    replayed: "The previously committed action was recovered safely.",
    failed: "The action was not committed. Refresh the current facts and retry.",
    conflict: "The order or delivery changed. Refresh before retrying.",
    invalid: "Complete the required reason and inspection fields.",
    returnCase: "Return case",
    delivery: "Delivery",
    inventory: "Inventory",
    returns: "Return",
    cancelDialog: "Cancel",
  },
  fr: {
    heading: "Annulation et retours physiques",
    authority: "Autorité de récupération gouvernée",
    loading: "Chargement de l'autorité de récupération…",
    noAction: "Aucune action d'annulation ou de retour physique n'est disponible.",
    loadFailed: "La position de récupération actuelle n'a pas pu être chargée.",
    cancel: "Annuler avant expédition",
    delivery_failed: "Échec de livraison",
    delivery_refused: "Refus du client",
    return_in_transit: "Retour en transit",
    receive_return: "Recevoir le retour physique",
    inspect_return: "Inspecter les articles retournés",
    cancelTitle: "Annuler cette commande avant expédition ?",
    cancelBody: "La réservation exacte sera libérée et le stock disponible restauré atomiquement.",
    delivery_failedTitle: "Enregistrer un échec de livraison ?",
    delivery_failedBody: "Le stock reste indisponible jusqu'au retour physique et à l'inspection.",
    delivery_refusedTitle: "Enregistrer un refus client ?",
    delivery_refusedBody: "Le stock reste chez le transporteur jusqu'au retour physique et à l'inspection.",
    return_in_transitTitle: "Marquer le colis en retour ?",
    return_in_transitBody: "Le transit retour est enregistré sans restaurer le stock vendable.",
    receive_returnTitle: "Recevoir physiquement le colis ?",
    receive_returnBody: "Les articles entrent en quarantaine d'inspection et ne sont pas encore vendables.",
    inspect_returnTitle: "Terminer l'inspection du retour ?",
    inspect_returnBody: "Chaque article doit être classé disponible, endommagé, en quarantaine ou perdu.",
    reason: "Code motif",
    reasonPlaceholder: "customer-refused",
    providerEvent: "ID événement transporteur (facultatif)",
    providerEventPlaceholder: "ID événement ou suivi transporteur",
    disposition: "Disposition",
    chooseDisposition: "Choisir la disposition",
    available: "Disponible",
    damaged: "Endommagé",
    quarantine: "Quarantaine",
    lost: "Perdu",
    commit: "Valider l'action gouvernée",
    committed: "L'action de récupération a été validée.",
    replayed: "L'action déjà validée a été récupérée sans risque.",
    failed: "L'action n'a pas été validée. Actualisez puis réessayez.",
    conflict: "La commande ou la livraison a changé. Actualisez avant de réessayer.",
    invalid: "Complétez le motif et les champs d'inspection requis.",
    returnCase: "Dossier retour",
    delivery: "Livraison",
    inventory: "Stock",
    returns: "Retour",
    cancelDialog: "Annuler",
  },
  ar: {
    heading: "الإلغاء والإرجاع الفعلي",
    authority: "صلاحية استرجاع موثوقة",
    loading: "جارٍ تحميل صلاحية الاسترجاع الحالية…",
    noAction: "لا يوجد إجراء إلغاء أو إرجاع فعلي متاح حاليًا.",
    loadFailed: "تعذر تحميل حالة الاسترجاع الحالية.",
    cancel: "إلغاء قبل الشحن",
    delivery_failed: "فشل التوصيل",
    delivery_refused: "رفض الزبون",
    return_in_transit: "الإرجاع قيد النقل",
    receive_return: "استلام الإرجاع فعليًا",
    inspect_return: "فحص السلع المرتجعة",
    cancelTitle: "إلغاء الطلبية قبل الشحن؟",
    cancelBody: "سيُحرر الحجز الدقيق ويُعاد المخزون المتاح داخل معاملة واحدة.",
    delivery_failedTitle: "تسجيل فشل التوصيل؟",
    delivery_failedBody: "يبقى المخزون غير متاح حتى يرجع الطرد فعليًا ويتم فحصه.",
    delivery_refusedTitle: "تسجيل رفض الزبون؟",
    delivery_refusedBody: "يبقى المخزون لدى شركة التوصيل حتى الإرجاع والفحص الفعلي.",
    return_in_transitTitle: "تعليم الطرد كإرجاع قيد النقل؟",
    return_in_transitBody: "يسجل مسار الإرجاع دون إعادة المخزون القابل للبيع.",
    receive_returnTitle: "استلام الطرد المرتجع فعليًا؟",
    receive_returnBody: "تدخل السلع إلى حجر الفحص ولا تصبح متاحة للبيع بعد.",
    inspect_returnTitle: "إتمام فحص السلع المرتجعة؟",
    inspect_returnBody: "يجب تصنيف كل عنصر كمتاح أو تالف أو محجور أو مفقود.",
    reason: "رمز السبب",
    reasonPlaceholder: "customer-refused",
    providerEvent: "معرّف حدث شركة التوصيل (اختياري)",
    providerEventPlaceholder: "معرّف الحدث أو تحديث التتبع",
    disposition: "التصنيف",
    chooseDisposition: "اختر التصنيف",
    available: "متاح",
    damaged: "تالف",
    quarantine: "محجور",
    lost: "مفقود",
    commit: "اعتماد الإجراء الموثوق",
    committed: "تم اعتماد إجراء الاسترجاع.",
    replayed: "تمت استعادة الإجراء المعتمد سابقًا بأمان.",
    failed: "لم يتم اعتماد الإجراء. حدّث الحالة ثم أعد المحاولة.",
    conflict: "تغيّرت الطلبية أو الشحنة. حدّث الصفحة قبل إعادة المحاولة.",
    invalid: "أكمل رمز السبب وحقول الفحص المطلوبة.",
    returnCase: "ملف الإرجاع",
    delivery: "التوصيل",
    inventory: "المخزون",
    returns: "الإرجاع",
    cancelDialog: "إلغاء",
  },
} as const;

const ACTION_ICON = {
  cancel: Ban,
  delivery_failed: AlertTriangle,
  delivery_refused: PackageX,
  return_in_transit: Truck,
  receive_return: RotateCcw,
  inspect_return: SearchCheck,
} as const;

const PROVIDER_ACTIONS = new Set<CanonicalOrderRecoveryAction>([
  "delivery_failed",
  "delivery_refused",
  "return_in_transit",
  "receive_return",
]);

async function fetchPosition(url: string): Promise<RecoveryPosition> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("recovery-position-failed");
  const body = (await response.json()) as { position: RecoveryPosition };
  return body.position;
}

export function CanonicalOrderRecoveryActions({ orderId }: { orderId: string }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const router = useRouter();
  const {
    data: position,
    error: positionError,
    isLoading,
    mutate,
  } = useSWR(`/api/orders/${orderId}/recovery`, fetchPosition, {
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  const [selectedAction, setSelectedAction] =
    useState<CanonicalOrderRecoveryAction | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [providerEventId, setProviderEventId] = useState("");
  const [dispositions, setDispositions] = useState<
    Record<string, CanonicalReturnDisposition | "">
  >({});
  const [committing, setCommitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspectionComplete = useMemo(
    () =>
      position?.items.every(
        (item) => dispositions[item.orderItemId] !== undefined && dispositions[item.orderItemId] !== "",
      ) ?? false,
    [dispositions, position],
  );

  function storageKey(action: CanonicalOrderRecoveryAction): string {
    return `sf-order-recovery:${orderId}:${position?.orderVersion ?? "unknown"}:${action}`;
  }

  function commandKey(action: CanonicalOrderRecoveryAction): string {
    const key = storageKey(action);
    const existing = window.localStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  function open(action: CanonicalOrderRecoveryAction): void {
    setSelectedAction(action);
    setReasonCode("");
    setProviderEventId("");
    setNotice(null);
    setError(null);
    if (action === "inspect_return" && position) {
      setDispositions(
        Object.fromEntries(position.items.map((item) => [item.orderItemId, ""])),
      );
    }
  }

  async function commit(): Promise<void> {
    if (!selectedAction || !position || !reasonCode.trim()) {
      setError(copy.invalid);
      return;
    }
    if (selectedAction === "inspect_return" && !inspectionComplete) {
      setError(copy.invalid);
      return;
    }

    setCommitting(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = commandKey(selectedAction);
    try {
      const response = await fetch(`/api/orders/${orderId}/recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedAction,
          expectedVersion: position.orderVersion,
          reasonCode: reasonCode.trim(),
          providerEventId:
            PROVIDER_ACTIONS.has(selectedAction) && providerEventId.trim()
              ? providerEventId.trim()
              : undefined,
          occurredAt: new Date().toISOString(),
          items:
            selectedAction === "inspect_return"
              ? position.items.map((item) => ({
                  orderItemId: item.orderItemId,
                  quantity: item.quantity,
                  disposition: dispositions[item.orderItemId],
                }))
              : undefined,
          idempotencyKey,
          correlationId: `order-recovery-ui:${idempotencyKey}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          body.code === "CONFLICT"
            ? copy.conflict
            : body.code === "VALIDATION_ERROR"
              ? copy.invalid
              : copy.failed;
        throw new Error(message);
      }
      window.localStorage.removeItem(storageKey(selectedAction));
      setSelectedAction(null);
      setNotice(body.command?.replayed ? copy.replayed : copy.committed);
      await mutate();
      await mutatePrefix("/api/orders");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.failed);
    } finally {
      setCommitting(false);
    }
  }

  if (isLoading && !position) {
    return <p className="text-sm text-muted-foreground">{copy.loading}</p>;
  }
  if (positionError || !position) {
    return <p className="text-sm text-destructive" role="alert">{copy.loadFailed}</p>;
  }
  if (position.availableActions.length === 0 && !position.returnCase) return null;

  const dialogTitle = selectedAction ? copy[`${selectedAction}Title`] : "";
  const dialogBody = selectedAction ? copy[`${selectedAction}Body`] : "";

  return (
    <div className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{copy.heading}</p>
          <Badge variant="outline" className="mt-1">{copy.authority}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {position.availableActions.map((action) => {
            const Icon = ACTION_ICON[action] ?? PackageCheck;
            return (
              <Button
                key={action}
                size="sm"
                variant={action === "cancel" || action === "delivery_refused" ? "destructive" : "outline"}
                onClick={() => open(action)}
                disabled={committing}
              >
                <Icon className="me-1.5 h-4 w-4" />
                {copy[action]}
              </Button>
            );
          })}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{copy.delivery}</dt>
          <dd className="font-medium" dir="auto">{position.deliveryState ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.inventory}</dt>
          <dd className="font-medium" dir="auto">{position.inventoryState ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.returns}</dt>
          <dd className="font-medium" dir="auto">{position.returnState ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{copy.returnCase}</dt>
          <dd className="truncate font-medium" dir="auto">
            {position.returnCase?.currentState ?? "—"}
          </dd>
        </div>
      </dl>

      {position.availableActions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noAction}</p>
      ) : null}
      {notice ? <p className="text-sm text-success" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <AlertDialog
        open={selectedAction !== null}
        onOpenChange={(next) => {
          if (!next && !committing) setSelectedAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialogBody}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="recovery-reason">{copy.reason}</Label>
              <Input
                id="recovery-reason"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                placeholder={copy.reasonPlaceholder}
                disabled={committing}
                dir="auto"
              />
            </div>

            {selectedAction && PROVIDER_ACTIONS.has(selectedAction) ? (
              <div className="space-y-1.5">
                <Label htmlFor="recovery-provider-event">{copy.providerEvent}</Label>
                <Input
                  id="recovery-provider-event"
                  value={providerEventId}
                  onChange={(event) => setProviderEventId(event.target.value)}
                  placeholder={copy.providerEventPlaceholder}
                  disabled={committing}
                  dir="auto"
                />
              </div>
            ) : null}

            {selectedAction === "inspect_return" ? (
              <div className="space-y-3">
                {position.items.map((item) => (
                  <div
                    key={item.orderItemId}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_180px] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" dir="auto">
                        {item.productName}
                        {item.variantName ? ` · ${item.variantName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">× {item.quantity}</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`disposition-${item.orderItemId}`} className="text-xs">
                        {copy.disposition}
                      </Label>
                      <select
                        id={`disposition-${item.orderItemId}`}
                        value={dispositions[item.orderItemId] ?? ""}
                        onChange={(event) =>
                          setDispositions((current) => ({
                            ...current,
                            [item.orderItemId]: event.target.value as CanonicalReturnDisposition | "",
                          }))
                        }
                        disabled={committing}
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">{copy.chooseDisposition}</option>
                        <option value="available">{copy.available}</option>
                        <option value="damaged">{copy.damaged}</option>
                        <option value="quarantine">{copy.quarantine}</option>
                        <option value="lost">{copy.lost}</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={committing}>{copy.cancelDialog}</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                committing ||
                !reasonCode.trim() ||
                (selectedAction === "inspect_return" && !inspectionComplete)
              }
              onClick={(event) => {
                event.preventDefault();
                void commit();
              }}
            >
              {committing ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {copy.commit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
