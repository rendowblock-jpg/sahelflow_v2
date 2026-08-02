"use client";

import { useState } from "react";
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
  FileCheck2,
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
    authority: "Canonical order authority",
    importAuthority: "Imported order pending catalog mapping",
    confirm: "Confirm order",
    reject: "Reject order",
    submitDraft: "Submit draft for confirmation",
    submitDraftCommitted: "The AI draft is now in the confirmation queue.",
    submitDraftReplayed: "The previous draft submission was recovered safely.",
    confirmTitle: "Confirm this order?",
    confirmBody: "This atomically reserves exact available stock and records the inventory movement.",
    rejectTitle: "Reject this order?",
    rejectBody: "Enter the seller-approved rejection reason.",
    reasonLabel: "Rejection reason",
    reasonPlaceholder: "Reason for rejecting this order",
    proceed: "Commit decision",
    committed: "Decision committed.",
    replayed: "The previously committed decision was recovered safely.",
    versionMissing: "Refresh the order before committing a decision.",
    importBlocked: "Map this imported order to exact catalog products and variants before confirmation.",
  },
  fr: {
    authority: "Autorité canonique de commande",
    importAuthority: "Commande importée en attente de correspondance catalogue",
    confirm: "Confirmer la commande",
    reject: "Refuser la commande",
    submitDraft: "Soumettre le brouillon à confirmation",
    submitDraftCommitted: "Le brouillon IA est maintenant dans la file de confirmation.",
    submitDraftReplayed: "La soumission précédente du brouillon a été récupérée en toute sécurité.",
    confirmTitle: "Confirmer cette commande ?",
    confirmBody: "Cette action réserve atomiquement le stock exact disponible et enregistre le mouvement.",
    rejectTitle: "Refuser cette commande ?",
    rejectBody: "Saisissez le motif de refus approuvé par le vendeur.",
    reasonLabel: "Motif du refus",
    reasonPlaceholder: "Motif du refus de cette commande",
    proceed: "Valider la décision",
    committed: "Décision validée.",
    replayed: "La décision déjà validée a été récupérée en toute sécurité.",
    versionMissing: "Actualisez la commande avant de valider une décision.",
    importBlocked: "Associez cette commande importée aux produits et variantes exacts avant confirmation.",
  },
  ar: {
    authority: "صلاحية الطلبية الموثوقة",
    importAuthority: "طلبية مستوردة بانتظار ربط الكتالوج",
    confirm: "تأكيد الطلبية",
    reject: "رفض الطلبية",
    submitDraft: "إرسال المسودة إلى قائمة التأكيد",
    submitDraftCommitted: "أصبحت مسودة الذكاء الاصطناعي ضمن قائمة التأكيد.",
    submitDraftReplayed: "تمت استعادة إرسال المسودة السابق بأمان.",
    confirmTitle: "تأكيد هذه الطلبية؟",
    confirmBody: "سيتم حجز المخزون المتاح بدقة وتسجيل حركة المخزون ضمن عملية ذرية واحدة.",
    rejectTitle: "رفض هذه الطلبية؟",
    rejectBody: "أدخل سبب الرفض المعتمد من البائع.",
    reasonLabel: "سبب الرفض",
    reasonPlaceholder: "سبب رفض هذه الطلبية",
    proceed: "اعتماد القرار",
    committed: "تم اعتماد القرار.",
    replayed: "تمت استعادة القرار المعتمد سابقًا بأمان.",
    versionMissing: "حدّث الطلبية قبل اعتماد القرار.",
    importBlocked: "اربط الطلبية المستوردة بالمنتجات والمتغيرات الدقيقة قبل تأكيدها.",
  },
} as const;

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
  currentVersion?: number;
  mutationAuthority?:
    | "canonical_v1"
    | "confirmation_blocked"
    | "legacy_compatibility";
}

type Decision = "confirm" | "reject";

export function OrderStatusActions({
  orderId,
  currentStatus,
  currentVersion,
  mutationAuthority = "legacy_compatibility",
}: OrderStatusActionsProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const copy = DECISION_COPY[locale];
  const [loading, setLoading] = useState<OrderStatus | Decision | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");

  function decisionKey(selected: Decision): string {
    return `sf-order-decision:${orderId}:${currentVersion}:${selected}`;
  }

  function commandKey(selected: Decision): string {
    const key = decisionKey(selected);
    const prior = window.localStorage.getItem(key);
    if (prior && prior.length >= 8) return prior;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  function draftSubmissionKey(): string {
    return `sf-source-draft-submit:${orderId}:${currentVersion}`;
  }

  function draftSubmissionCommandKey(): string {
    const key = draftSubmissionKey();
    const prior = window.localStorage.getItem(key);
    if (prior && prior.length >= 8) return prior;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  async function submitDraft() {
    if (currentVersion === undefined) {
      setError(copy.versionMissing);
      return;
    }
    setLoading("submit");
    setError(null);
    setNotice(null);
    const idempotencyKey = draftSubmissionCommandKey();
    try {
      const response = await fetch(`/api/orders/${orderId}/source/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: currentVersion,
          idempotencyKey,
          correlationId: `source-draft-ui:${idempotencyKey}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body.error?.message ?? body.error;
        throw new Error(
          typeof message === "string"
            ? message
            : t("orders.statusActions.updateFailed"),
        );
      }
      window.localStorage.removeItem(draftSubmissionKey());
      setNotice(
        body.command?.replayed
          ? copy.submitDraftReplayed
          : copy.submitDraftCommitted,
      );
      await mutatePrefix("/api/orders");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("errors.somethingWrong"),
      );
    } finally {
      setLoading(null);
    }
  }

  async function commitDecision() {
    if (!decision) return;
    if (currentVersion === undefined) {
      setError(copy.versionMissing);
      return;
    }
    if (decision === "reject" && !reason.trim()) return;

    setLoading(decision);
    setError(null);
    setNotice(null);
    const idempotencyKey = commandKey(decision);
    try {
      const response = await fetch(`/api/orders/${orderId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          expectedVersion: currentVersion,
          idempotencyKey,
          correlationId: `manual-decision-ui:${idempotencyKey}`,
          reason: decision === "reject" ? reason.trim() : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body.error?.message ?? body.error;
        throw new Error(
          translateManualOrderError(
            body.code,
            message,
            locale,
            typeof message === "string"
              ? message
              : t("orders.statusActions.updateFailed"),
          ),
        );
      }

      window.localStorage.removeItem(decisionKey(decision));
      setNotice(body.command?.replayed ? copy.replayed : copy.committed);
      setDecision(null);
      setReason("");
      await mutatePrefix("/api/orders");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("errors.somethingWrong"),
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleLegacyTransition(to: OrderStatus) {
    setLoading(to);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : t("orders.statusActions.updateFailed"),
        );
      }
      await mutatePrefix("/api/orders");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("errors.somethingWrong"),
      );
    } finally {
      setLoading(null);
    }
  }

  if (mutationAuthority === "canonical_v1") {
    return (
      <div className="space-y-3">
        <Badge variant="outline">{copy.authority}</Badge>
        {currentStatus === "draft" ? (
          <Button
            size="sm"
            onClick={() => void submitDraft()}
            disabled={loading !== null}
          >
            {loading === "submit" ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck2 className="me-1.5 h-4 w-4" />
            )}
            {copy.submitDraft}
          </Button>
        ) : currentStatus === "pending" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setDecision("confirm")}
              disabled={loading !== null}
            >
              <CheckCircle2 className="me-1.5 h-4 w-4" />
              {copy.confirm}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDecision("reject")}
              disabled={loading !== null}
            >
              <XCircle className="me-1.5 h-4 w-4" />
              {copy.reject}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("orders.statusActions.noActions")}
          </p>
        )}

        {notice && <p className="text-sm text-success" role="status">{notice}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <AlertDialog
          open={decision !== null}
          onOpenChange={(open) => {
            if (!open && loading === null) {
              setDecision(null);
              setReason("");
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {decision === "reject" ? copy.rejectTitle : copy.confirmTitle}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {decision === "reject" ? copy.rejectBody : copy.confirmBody}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {decision === "reject" && (
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.reasonLabel}</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={copy.reasonPlaceholder}
                  maxLength={500}
                  required
                  autoFocus
                />
              </label>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading !== null}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  loading !== null ||
                  (decision === "reject" && !reason.trim())
                }
                onClick={(event) => {
                  event.preventDefault();
                  void commitDecision();
                }}
              >
                {loading ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
                {copy.proceed}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (mutationAuthority === "confirmation_blocked") {
    return (
      <div className="space-y-2">
        <Badge variant="outline">{copy.importAuthority}</Badge>
        <p className="text-sm text-muted-foreground" role="status">
          {copy.importBlocked}
        </p>
      </div>
    );
  }

  const allowed = getAllowedTransitions(currentStatus);
  if (allowed.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{t("orders.statusActions.finalStatus")}</Badge>
        <span>{t("orders.statusActions.noActions")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {t("orders.statusActions.actionsLabel")}
        </span>
        {allowed.map((target) => {
          const config = ACTION_CONFIG[target];
          const Icon = config.icon;
          return (
            <Button
              key={target}
              variant={config.variant}
              size="sm"
              onClick={() => void handleLegacyTransition(target)}
              disabled={loading !== null}
            >
              {loading === target ? (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Icon className="me-1.5 h-4 w-4" />
              )}
              {t(config.labelKey)}
            </Button>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
