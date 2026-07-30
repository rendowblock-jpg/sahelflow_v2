"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck, Truck } from "lucide-react";

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
import { useI18n } from "@/hooks/use-i18n";
import type {
  CanonicalDeliveryState,
  CodFinancialState,
  FulfillmentState,
  OrderInventoryState,
} from "@/lib/business-truth/contracts";
import { mutatePrefix } from "@/lib/swr/mutate";
import type { OrderStatus } from "@/types/domain";

type FulfillmentAction = "pack" | "ship" | "deliver";

const COPY = {
  en: {
    authority: "Canonical fulfillment authority",
    heading: "Fulfillment and delivery",
    fulfillment: "Fulfillment",
    delivery: "Delivery",
    inventory: "Inventory",
    cod: "COD",
    legacy: "Awaiting governed adoption",
    pack: "Mark packed",
    ship: "Dispatch shipment",
    deliver: "Mark delivered",
    packTitle: "Mark this order as packed?",
    packBody: "The reserved items remain held and the order becomes ready for dispatch.",
    shipTitle: "Dispatch this order?",
    shipBody: "This consumes the exact reservations into outbound inventory. It does not call a courier provider.",
    deliverTitle: "Mark this order as delivered?",
    deliverBody: "This closes fulfillment and creates the carrier COD receivable. Collection and remittance remain separate.",
    commit: "Commit transition",
    committed: "Transition committed.",
    replayed: "The previously committed transition was recovered safely.",
    noAction: "No governed fulfillment action is available from the current state.",
    failed: "The transition was not committed. Refresh and retry safely.",
    conflict: "This order changed or its inventory authority is incomplete. Refresh before retrying.",
    invalid: "This transition is not valid from the current order state.",
    notFound: "This order is no longer available.",
  },
  fr: {
    authority: "Autorité canonique d'exécution",
    heading: "Préparation et livraison",
    fulfillment: "Préparation",
    delivery: "Livraison",
    inventory: "Stock",
    cod: "COD",
    legacy: "En attente d'adoption gouvernée",
    pack: "Marquer comme emballée",
    ship: "Expédier la commande",
    deliver: "Marquer comme livrée",
    packTitle: "Marquer cette commande comme emballée ?",
    packBody: "Les articles réservés restent bloqués et la commande devient prête à expédier.",
    shipTitle: "Expédier cette commande ?",
    shipBody: "Les réservations exactes passent en stock sortant. Aucun transporteur n'est appelé.",
    deliverTitle: "Marquer cette commande comme livrée ?",
    deliverBody: "La préparation est clôturée et la créance COD transporteur est créée. Encaissement et versement restent séparés.",
    commit: "Valider la transition",
    committed: "Transition validée.",
    replayed: "La transition déjà validée a été récupérée en toute sécurité.",
    noAction: "Aucune action gouvernée n'est disponible depuis l'état actuel.",
    failed: "La transition n'a pas été validée. Actualisez puis réessayez sans risque.",
    conflict: "La commande a changé ou son autorité de stock est incomplète. Actualisez avant de réessayer.",
    invalid: "Cette transition n'est pas valide depuis l'état actuel.",
    notFound: "Cette commande n'est plus disponible.",
  },
  ar: {
    authority: "صلاحية تنفيذ موثوقة",
    heading: "التجهيز والتوصيل",
    fulfillment: "التجهيز",
    delivery: "التوصيل",
    inventory: "المخزون",
    cod: "الدفع عند الاستلام",
    legacy: "بانتظار الاعتماد الموثوق",
    pack: "تعليمها كمجهّزة",
    ship: "إرسال الشحنة",
    deliver: "تعليمها كمسلّمة",
    packTitle: "هل تم تجهيز هذه الطلبية؟",
    packBody: "يبقى المخزون الدقيق محجوزًا وتصبح الطلبية جاهزة للإرسال.",
    shipTitle: "هل تريد إرسال هذه الطلبية؟",
    shipBody: "تُنقل الحجوزات الدقيقة إلى مخزون قيد الشحن دون الاتصال بمزوّد توصيل.",
    deliverTitle: "هل تم تسليم هذه الطلبية؟",
    deliverBody: "يُغلق التجهيز وتُنشأ مستحقات الدفع عند الاستلام. يبقى التحصيل والتحويل منفصلين.",
    commit: "اعتماد الانتقال",
    committed: "تم اعتماد الانتقال.",
    replayed: "تمت استعادة الانتقال المعتمد سابقًا بأمان.",
    noAction: "لا يوجد إجراء تنفيذ موثوق متاح من الحالة الحالية.",
    failed: "لم يتم اعتماد الانتقال. حدّث الصفحة ثم أعد المحاولة بأمان.",
    conflict: "تغيّرت الطلبية أو أن صلاحية مخزونها غير مكتملة. حدّث الصفحة قبل إعادة المحاولة.",
    invalid: "هذا الانتقال غير صالح من حالة الطلبية الحالية.",
    notFound: "لم تعد هذه الطلبية متاحة.",
  },
} as const;

const STATE_LABELS = {
  en: {
    unfulfilled: "Not prepared",
    ready: "Packed and ready",
    shipped: "Shipped",
    closed: "Closed",
    not_created: "Not created",
    in_transit: "In transit",
    delivered: "Delivered",
    unreserved: "Not reserved",
    reserved: "Reserved",
    outbound: "Outbound",
    settled: "Settled",
    not_expected: "Not expected",
    receivable: "Awaiting collection",
  },
  fr: {
    unfulfilled: "Non préparée",
    ready: "Emballée et prête",
    shipped: "Expédiée",
    closed: "Clôturée",
    not_created: "Non créée",
    in_transit: "En transit",
    delivered: "Livrée",
    unreserved: "Non réservé",
    reserved: "Réservé",
    outbound: "Sortant",
    settled: "Soldé",
    not_expected: "Non attendu",
    receivable: "En attente d'encaissement",
  },
  ar: {
    unfulfilled: "غير مجهّزة",
    ready: "مجهّزة وجاهزة",
    shipped: "مشحونة",
    closed: "مغلقة",
    not_created: "غير منشأة",
    in_transit: "قيد النقل",
    delivered: "مسلّمة",
    unreserved: "غير محجوز",
    reserved: "محجوز",
    outbound: "قيد الشحن",
    settled: "مسوّى",
    not_expected: "غير مستحق",
    receivable: "بانتظار التحصيل",
  },
} as const;

interface CanonicalFulfillmentActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
  currentVersion: number;
  fulfillmentState: FulfillmentState | null;
  deliveryState: CanonicalDeliveryState | null;
  inventoryState: OrderInventoryState | null;
  codState: CodFinancialState | null;
}

function availableAction(
  status: OrderStatus,
  fulfillment: FulfillmentState | null,
  delivery: CanonicalDeliveryState | null,
): FulfillmentAction | null {
  if (status === "confirmed" && (fulfillment === null || fulfillment === "unfulfilled")) {
    return "pack";
  }
  if (status === "confirmed" && fulfillment === "ready") return "ship";
  if (status === "shipped" && fulfillment === "shipped" && delivery === "in_transit") {
    return "deliver";
  }
  return null;
}

export function CanonicalFulfillmentActions({
  orderId,
  currentStatus,
  currentVersion,
  fulfillmentState,
  deliveryState,
  inventoryState,
  codState,
}: CanonicalFulfillmentActionsProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const copy = COPY[locale];
  const action = availableAction(currentStatus, fulfillmentState, deliveryState);
  const stateLabels = STATE_LABELS[locale] as Readonly<Record<string, string>>;
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function storageKey(selected: FulfillmentAction): string {
    return `sf-order-fulfillment:${orderId}:${currentVersion}:${selected}`;
  }

  function commandKey(selected: FulfillmentAction): string {
    const key = storageKey(selected);
    const prior = window.localStorage.getItem(key);
    if (prior && prior.length >= 8) return prior;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  async function commit(): Promise<void> {
    if (!action) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = commandKey(action);
    try {
      const response = await fetch(`/api/orders/${orderId}/fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedVersion: currentVersion,
          idempotencyKey,
          correlationId: `manual-fulfillment-ui:${idempotencyKey}`,
        }),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          responseBody.code === "CONFLICT"
            ? copy.conflict
            : responseBody.code === "VALIDATION_ERROR"
              ? copy.invalid
              : responseBody.code === "NOT_FOUND"
                ? copy.notFound
                : copy.failed;
        throw new Error(message);
      }
      window.localStorage.removeItem(storageKey(action));
      setNotice(responseBody.command?.replayed ? copy.replayed : copy.committed);
      setConfirming(false);
      await mutatePrefix("/api/orders");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.failed);
    } finally {
      setLoading(false);
    }
  }

  const Icon = action === "ship" ? Truck : action === "deliver" ? CheckCircle2 : PackageCheck;
  const title = action ? copy[`${action}Title`] : "";
  const description = action ? copy[`${action}Body`] : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{copy.heading}</p>
          <Badge variant="outline" className="mt-1">{copy.authority}</Badge>
        </div>
        {action ? (
          <Button size="sm" onClick={() => setConfirming(true)} disabled={loading}>
            <Icon className="me-1.5 h-4 w-4" />
            {copy[action]}
          </Button>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {[
          [copy.fulfillment, fulfillmentState],
          [copy.delivery, deliveryState],
          [copy.inventory, inventoryState],
          [copy.cod, codState],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium" dir="auto">
              {value ? stateLabels[value] ?? value : copy.legacy}
            </dd>
          </div>
        ))}
      </dl>

      {!action ? <p className="text-sm text-muted-foreground">{copy.noAction}</p> : null}
      {notice ? <p className="text-sm text-success" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <AlertDialog open={confirming} onOpenChange={(open) => !loading && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(event) => {
                event.preventDefault();
                void commit();
              }}
            >
              {loading ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {copy.commit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
