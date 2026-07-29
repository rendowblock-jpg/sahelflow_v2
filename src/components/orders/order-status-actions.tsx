"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { getAllowedTransitions } from "@/lib/order-transitions";
import { translateManualOrderError } from "@/lib/orders/manual-order-error";
import { mutatePrefix } from "@/lib/swr/mutate";
import type { OrderStatus } from "@/types/domain";
import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";

const ACTION_CONFIG: Record<
  OrderStatus,
  {
    labelKey: string;
    icon: typeof CheckCircle2;
    variant: "default" | "destructive" | "outline";
  }
> = {
  confirmed: { labelKey: "orders.confirmOrder", icon: CheckCircle2, variant: "default" },
  shipped: { labelKey: "orders.shipOrder", icon: Truck, variant: "default" },
  delivered: { labelKey: "orders.statusActions.markDelivered", icon: PackageCheck, variant: "default" },
  returned: { labelKey: "orders.statusActions.returnButton", icon: RotateCcw, variant: "destructive" },
  refused: { labelKey: "orders.status.refused", icon: XCircle, variant: "destructive" },
  cancelled: { labelKey: "common.cancel", icon: Ban, variant: "destructive" },
  draft: { labelKey: "orders.status.draft", icon: CheckCircle2, variant: "outline" },
  pending: { labelKey: "orders.statusActions.markPending", icon: Clock, variant: "default" },
};

const DECISION_COPY = {
  en: {
    canonical: "Canonical manual authority",
    legacy: "Legacy compatibility authority",
    loading: "Checking mutation authority…",
    confirmTitle: "Confirm this order?",
    confirmBody: "This commits an exact stock reservation and cannot use legacy fulfillment actions until the next governed command is available.",
    rejectTitle: "Reject this order?",
    rejectBody: "Record a clear reason for the rejection. The reason is stored in the governed audit trail.",
    reasonLabel: "Rejection reason",
    reasonPlaceholder: "Enter the seller-approved rejection reason",
    proceed: "Commit decision",
    committed: "Decision committed.",
    replayed: "The previously committed decision was recovered safely.",
  },
  fr: {
    canonical: "Autorité manuelle canonique",
    legacy: "Autorité de compatibilité héritée",
    loading: "Vérification de l’autorité de modification…",
    confirmTitle: "Confirmer cette commande ?",
    confirmBody: "Cette action valide une réservation exacte du stock. Les anciennes actions de traitement restent bloquées jusqu’à la prochaine commande gouvernée.",
    rejectTitle: "Rejeter cette commande ?",
    rejectBody: "Indiquez un motif clair. Il sera conservé dans le journal d’audit gouverné.",
    reasonLabel: "Motif du rejet",
    reasonPlaceholder: "Saisissez le motif approuvé par le vendeur",
    proceed: "Valider la décision",
    committed: "Décision validée.",
    replayed: "La décision déjà validée a été récupérée en toute sécurité.",
  },
  ar: {
    canonical: "صلاحية يدوية موثوقة",
    legacy: "صلاحية توافقية قديمة",
    loading: "جارٍ التحقق من صلاحية التعديل…",
    confirmTitle: "تأكيد هذا الطلب؟",
    confirmBody: "سيتم تثبيت حجز دقيق للمخزون، وستبقى إجراءات التنفيذ القديمة معطلة إلى أن تتوفر العملية الموثوقة التالية.",
    rejectTitle: "رفض هذا الطلب؟",
    rejectBody: "أدخل سببًا واضحًا للرفض. سيُحفظ السبب في سجل التدقيق الموثوق.",
    reasonLabel: "سبب الرفض",
    reasonPlaceholder: "أدخل سبب الرفض المعتمد من البائع",
    proceed: "اعتماد القرار",
    committed: "تم اعتماد القرار.",
    replayed: "تمت استعادة القرار المعتمد سابقًا بأمان.",
  },
} as const;

type DecisionReceipt = {
  idempotencyKey: string;
  expectedVersion: number;
};

type MutationAuthority = "loading" | "canonical_v1" | "legacy_compatibility";

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
  currentVersion?: number;
}

interface EditAuthorityResponse {
  version: number;
  trustedManual: boolean;
  activeReservation: boolean;
}

export function OrderStatusActions({
  orderId,
  currentStatus,
  currentVersion,
}: OrderStatusActionsProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const copy = DECISION_COPY[locale as keyof typeof DECISION_COPY] ?? DECISION_COPY.en;
  const [loading, setLoading] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [authority, setAuthority] = useState<MutationAuthority>("loading");
  const [canonicalFollowupLocked, setCanonicalFollowupLocked] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<OrderStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const decisionReceipts = useRef(new Map<OrderStatus, DecisionReceipt>());

  useEffect(() => {
    let active = true;
    void fetch(`/api/orders/${orderId}/edit-authority`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("authority lookup failed");
        return (await response.json()) as EditAuthorityResponse;
      })
      .then((resolved) => {
        if (!active) return;
        setAuthority(resolved.trustedManual ? "canonical_v1" : "legacy_compatibility");
        setCanonicalFollowupLocked(resolved.activeReservation);
      })
      .catch(() => {
        if (active) setAuthority("legacy_compatibility");
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  const allowed = canonicalFollowupLocked
    ? []
    : currentStatus === "pending"
      ? authority === "canonical_v1"
        ? (["confirmed", "cancelled"] as OrderStatus[])
        : authority === "loading"
          ? []
          : (["cancelled"] as OrderStatus[])
      : getAllowedTransitions(currentStatus);

  async function createDecisionReceipt(target: OrderStatus): Promise<DecisionReceipt> {
    const existing = decisionReceipts.current.get(target);
    if (existing) return existing;

    let expectedVersion = currentVersion;
    if (expectedVersion === undefined) {
      const response = await fetch(`/api/orders/${orderId}/version`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(t("orders.statusActions.updateFailed"));
      const body = await response.json();
      if (body.order.status !== currentStatus) {
        throw new Error(t("orders.statusActions.updateFailed"));
      }
      expectedVersion = body.order.version as number;
    }

    const receipt = {
      idempotencyKey: crypto.randomUUID(),
      expectedVersion,
    };
    decisionReceipts.current.set(target, receipt);
    return receipt;
  }

  async function handleTransition(to: OrderStatus, reason?: string): Promise<boolean> {
    setLoading(to);
    setError(null);
    setFeedback(null);
    const isCanonicalDecision =
      authority === "canonical_v1" &&
      currentStatus === "pending" &&
      (to === "confirmed" || to === "cancelled");

    try {
      const receipt = isCanonicalDecision
        ? await createDecisionReceipt(to)
        : undefined;
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: to,
          ...(receipt
            ? {
                expectedVersion: receipt.expectedVersion,
                idempotencyKey: receipt.idempotencyKey,
                correlationId: `order-ui:${orderId}:${receipt.expectedVersion}`,
                ...(to === "cancelled" ? { reason } : {}),
              }
            : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          translateManualOrderError(
            body.code,
            body.error?.message ?? body.error,
            locale,
            t("orders.statusActions.updateFailed"),
          ),
        );
      }

      decisionReceipts.current.delete(to);
      if (body.command) {
        setFeedback(body.command.replayed ? copy.replayed : copy.committed);
      }
      router.refresh();
      void mutatePrefix("/api/orders");
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("errors.somethingWrong"),
      );
      return false;
    } finally {
      setLoading(null);
    }
  }

  async function commitDecision() {
    if (!decisionTarget) return;
    const reason = decisionTarget === "cancelled" ? rejectionReason.trim() : undefined;
    if (decisionTarget === "cancelled" && !reason) return;
    const committed = await handleTransition(decisionTarget, reason);
    if (committed) {
      setDecisionTarget(null);
      setRejectionReason("");
    }
  }

  const authorityLabel =
    authority === "loading"
      ? copy.loading
      : authority === "canonical_v1"
        ? copy.canonical
        : copy.legacy;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={authority === "canonical_v1" ? "default" : "outline"}>
          {authorityLabel}
        </Badge>
        {feedback && <span className="text-sm text-success" role="status">{feedback}</span>}
      </div>

      {allowed.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{t("orders.statusActions.finalStatus")}</Badge>
          <span>{t("orders.statusActions.noActions")}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("orders.statusActions.actionsLabel")}
          </span>
          {allowed.map((target) => {
            const config = ACTION_CONFIG[target];
            if (!config?.labelKey) return null;
            const Icon = config.icon;
            const isLoading = loading === target;
            const isCanonicalDecision =
              authority === "canonical_v1" &&
              currentStatus === "pending" &&
              (target === "confirmed" || target === "cancelled");
            return (
              <Button
                key={target}
                variant={config.variant}
                size="sm"
                onClick={() => {
                  if (isCanonicalDecision) {
                    setDecisionTarget(target);
                    setError(null);
                  } else {
                    void handleTransition(target);
                  }
                }}
                disabled={loading !== null || authority === "loading"}
                aria-describedby={error ? `order-status-error-${orderId}` : undefined}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4 me-1.5" />
                )}
                {t(config.labelKey)}
              </Button>
            );
          })}
        </div>
      )}

      {error && (
        <p
          id={`order-status-error-${orderId}`}
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <AlertDialog
        open={decisionTarget !== null}
        onOpenChange={(open) => {
          if (!open && loading === null) {
            setDecisionTarget(null);
            setRejectionReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decisionTarget === "cancelled" ? copy.rejectTitle : copy.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decisionTarget === "cancelled" ? copy.rejectBody : copy.confirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {decisionTarget === "cancelled" && (
            <div className="space-y-2">
              <label htmlFor={`rejection-reason-${orderId}`} className="text-sm font-medium">
                {copy.reasonLabel}
              </label>
              <Textarea
                id={`rejection-reason-${orderId}`}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder={copy.reasonPlaceholder}
                rows={4}
                aria-required="true"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading !== null}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void commitDecision();
              }}
              disabled={
                loading !== null ||
                (decisionTarget === "cancelled" && !rejectionReason.trim())
              }
            >
              {loading !== null && <Loader2 className="h-4 w-4 me-1.5 animate-spin" />}
              {copy.proceed}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
