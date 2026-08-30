"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageCircle,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";

import {
  SellerConditionBuilder,
  type SellerConditionDraft,
  type SellerConditionGroupDraft,
} from "@/components/automations/seller-condition-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import {
  actionAllowedForTrigger,
  conditionValueForEditor,
  getSellerActionSpec,
  getSellerRecheckStatuses,
  getSellerStatusTargets,
  getSellerStatusTargetsFromStatus,
  getSellerTriggerSpec,
  normalizeConditionValueForSubmit,
  sellerReadyTriggers,
  unsupportedTemplateVariablesForTrigger,
  type SellerAutomationAction,
  type SellerAutomationTrigger,
  type SellerConditionOperator,
  type SellerOrderCheckStatus,
  type SellerOrderStatusTarget,
} from "@/lib/automations/catalog";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type FailurePolicy = "stop" | "continue";
type StepConfig = {
  messageTemplate?: string;
  noteText?: string;
  targetStatus?: SellerOrderStatusTarget;
  delayMinutes?: number;
  expectedStatus?: SellerOrderCheckStatus;
};
type BuilderStep = {
  action: SellerAutomationAction;
  onFailure: FailurePolicy;
  config: StepConfig;
};

const WHATSAPP_MESSAGE_MAX_LENGTH = 4_000;
const NOTIFICATION_MESSAGE_MAX_LENGTH = 1_000;
const CUSTOMER_NOTE_MAX_LENGTH = 500;
const WAIT_MINUTES_MIN = 1;
const WAIT_MINUTES_MAX = 10_080;

export interface AutomationBuilderAutomation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  isActive: boolean;
  conditions?: string | null;
  config?: string | null;
  steps?: string | null;
  dryRun?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface AutomationBuilderPreset {
  name: string;
  trigger: SellerAutomationTrigger;
  conditions?: SellerConditionGroupDraft;
  steps: BuilderStep[];
}

interface Props {
  automation?: AutomationBuilderAutomation;
  preset?: AutomationBuilderPreset;
  children?: ReactNode;
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isSellerAction(value: unknown): value is SellerAutomationAction {
  return [
    "send_whatsapp",
    "update_status",
    "tag_customer",
    "send_notification",
    "wait",
    "recheck_order_status",
  ].includes(String(value));
}

function defaultMessage(trigger: string, locale: string): string {
  if (locale === "ar") {
    switch (trigger) {
      case "order.created":
        return "مرحباً {{customerName}}، استلمنا طلبك {{orderNumber}} وسنتواصل معك لتأكيده.";
      case "order.confirmed":
        return "تم تأكيد طلبك {{orderNumber}} بنجاح.";
      case "order.shipped":
        return "تم شحن طلبك {{orderNumber}} وهو في الطريق إليك.";
      case "order.delivered":
        return "تم تسليم طلبك {{orderNumber}}. شكراً لاختيارك متجرنا.";
      case "order.returned":
        return "تم تسجيل إرجاع الطلب {{orderNumber}}.";
      case "order.refused":
        return "تم تسجيل رفض الطلب {{orderNumber}}.";
      case "order.cancelled":
        return "تم إلغاء الطلب {{orderNumber}}.";
      default:
        return "شكراً لتواصلك معنا.";
    }
  }
  if (locale === "fr") {
    switch (trigger) {
      case "order.created":
        return "Bonjour {{customerName}}, nous avons bien reçu votre commande {{orderNumber}} et nous allons la confirmer avec vous.";
      case "order.confirmed":
        return "Votre commande {{orderNumber}} est confirmée.";
      case "order.shipped":
        return "Votre commande {{orderNumber}} a été expédiée et est en route.";
      case "order.delivered":
        return "Votre commande {{orderNumber}} a été livrée. Merci pour votre confiance !";
      case "order.returned":
        return "Le retour de la commande {{orderNumber}} a été enregistré.";
      case "order.refused":
        return "Le refus de la commande {{orderNumber}} a été enregistré.";
      case "order.cancelled":
        return "La commande {{orderNumber}} a été annulée.";
      default:
        return "Merci de nous avoir contactés.";
    }
  }
  switch (trigger) {
    case "order.created":
      return "Hi {{customerName}}, we received order {{orderNumber}} and will confirm it with you shortly.";
    case "order.confirmed":
      return "Your order {{orderNumber}} is confirmed.";
    case "order.shipped":
      return "Your order {{orderNumber}} has shipped and is on its way.";
    case "order.delivered":
      return "Your order {{orderNumber}} was delivered. Thank you for choosing us!";
    case "order.returned":
      return "The return for order {{orderNumber}} has been recorded.";
    case "order.refused":
      return "The refusal for order {{orderNumber}} has been recorded.";
    case "order.cancelled":
      return "Order {{orderNumber}} has been cancelled.";
    default:
      return "Thanks for getting in touch.";
  }
}

function defaultNotificationMessage(trigger: string, locale: string): string {
  if (locale === "ar") {
    if (trigger === "stock.low") {
      return "المخزون منخفض للمنتج {{productName}}: المتبقي {{stockLevel}}.";
    }
    if (trigger === "message.received") {
      return "رسالة جديدة من {{customerName}}: {{messageText}}";
    }
    if (trigger.startsWith("order.")) {
      return "الطلب {{orderNumber}} يحتاج انتباهك في ساهل فلو.";
    }
    return "تنبيه أتمتة يحتاج انتباهك.";
  }
  if (locale === "fr") {
    if (trigger === "stock.low") {
      return "Stock faible pour {{productName}} : {{stockLevel}} restant(s).";
    }
    if (trigger === "message.received") {
      return "Nouveau message de {{customerName}} : {{messageText}}";
    }
    if (trigger.startsWith("order.")) {
      return "La commande {{orderNumber}} nécessite votre attention dans SahelFlow.";
    }
    return "Une automatisation nécessite votre attention.";
  }
  if (trigger === "stock.low") {
    return "Low stock for {{productName}}: {{stockLevel}} remaining.";
  }
  if (trigger === "message.received") {
    return "New message from {{customerName}}: {{messageText}}";
  }
  if (trigger.startsWith("order.")) {
    return "Order {{orderNumber}} needs your attention in SahelFlow.";
  }
  return "An automation needs your attention.";
}

function defaultNote(trigger: string, locale: string): string {
  const variables = new Set(getSellerTriggerSpec(trigger)?.variables ?? []);
  if (variables.has("orderNumber")) {
    if (locale === "ar") return "ملاحظة أتمتة للطلب {{orderNumber}}";
    if (locale === "fr") return "Note d’automatisation pour {{orderNumber}}";
    return "Automation note for {{orderNumber}}";
  }
  if (variables.has("customerName")) {
    if (locale === "ar") return "ملاحظة أتمتة للعميل {{customerName}}";
    if (locale === "fr") return "Note d’automatisation pour {{customerName}}";
    return "Automation note for {{customerName}}";
  }
  if (locale === "ar") return "ملاحظة أتمتة";
  if (locale === "fr") return "Note d’automatisation";
  return "Automation note";
}

function defaultRecheckStatus(trigger: string): SellerOrderCheckStatus {
  switch (trigger) {
    case "order.confirmed":
      return "confirmed";
    case "order.shipped":
      return "shipped";
    case "order.delivered":
      return "delivered";
    case "order.returned":
      return "returned";
    case "order.refused":
      return "refused";
    case "order.cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function defaultStep(
  action: SellerAutomationAction,
  locale: string,
  trigger: string,
): BuilderStep {
  if (action === "send_whatsapp") {
    return {
      action,
      onFailure: "stop",
      config: { messageTemplate: defaultMessage(trigger, locale) },
    };
  }
  if (action === "send_notification") {
    return {
      action,
      onFailure: "stop",
      config: { messageTemplate: defaultNotificationMessage(trigger, locale) },
    };
  }
  if (action === "tag_customer") {
    return {
      action,
      onFailure: "stop",
      config: { noteText: defaultNote(trigger, locale) },
    };
  }
  if (action === "wait") {
    return {
      action,
      onFailure: "stop",
      config: { delayMinutes: 120 },
    };
  }
  if (action === "recheck_order_status") {
    return {
      action,
      onFailure: "stop",
      config: { expectedStatus: defaultRecheckStatus(trigger) },
    };
  }
  return {
    action,
    onFailure: "stop",
    config: { targetStatus: getSellerStatusTargets(trigger)[0] },
  };
}

function parseStoredSteps(
  automation: AutomationBuilderAutomation | undefined,
  locale: string,
): BuilderStep[] {
  if (!automation) return [];
  const parsedSteps = parseJson(automation.steps);
  if (Array.isArray(parsedSteps)) {
    const steps = parsedSteps.flatMap((entry): BuilderStep[] => {
      if (!entry || typeof entry !== "object") return [];
      const object = entry as Record<string, unknown>;
      if (!isSellerAction(object.action)) return [];
      const config =
        object.config && typeof object.config === "object"
          ? (object.config as StepConfig)
          : defaultStep(object.action, locale, automation.trigger).config;
      return [
        {
          action: object.action,
          onFailure: object.onFailure === "continue" ? "continue" : "stop",
          config,
        },
      ];
    });
    if (steps.length > 0) return steps;
  }

  if (isSellerAction(automation.action)) {
    const config = parseJson(automation.config);
    return [
      {
        action: automation.action,
        onFailure: "stop",
        config:
          config && typeof config === "object"
            ? (config as StepConfig)
            : defaultStep(automation.action, locale, automation.trigger).config,
      },
    ];
  }
  return [];
}

function parseStoredConditions(
  automation?: AutomationBuilderAutomation,
): SellerConditionGroupDraft {
  const parsed = parseJson(automation?.conditions);
  if (!parsed || typeof parsed !== "object") return null;
  const object = parsed as Record<string, unknown>;
  const mode = Array.isArray(object.all)
    ? "all"
    : Array.isArray(object.any)
      ? "any"
      : null;
  if (!mode) return null;
  const raw = object[mode] as unknown[];
  const conditions = raw.flatMap((entry): SellerConditionDraft[] => {
    if (!entry || typeof entry !== "object") return [];
    const condition = entry as Record<string, unknown>;
    if (typeof condition.field !== "string" || typeof condition.operator !== "string") {
      return [];
    }
    return [
      {
        field: condition.field,
        operator: condition.operator as SellerConditionOperator,
        value: conditionValueForEditor(condition.value),
      },
    ];
  });
  if (conditions.length === 0) return null;
  return mode === "all" ? { all: conditions } : { any: conditions };
}

function stepComplete(step: BuilderStep): boolean {
  if (step.action === "send_whatsapp") {
    const message = step.config.messageTemplate?.trim() ?? "";
    return message.length > 0 && message.length <= WHATSAPP_MESSAGE_MAX_LENGTH;
  }
  if (step.action === "send_notification") {
    const message = step.config.messageTemplate?.trim() ?? "";
    return message.length > 0 && message.length <= NOTIFICATION_MESSAGE_MAX_LENGTH;
  }
  if (step.action === "tag_customer") {
    const note = step.config.noteText?.trim() ?? "";
    return note.length > 0 && note.length <= CUSTOMER_NOTE_MAX_LENGTH;
  }
  if (step.action === "wait") {
    return Boolean(
      Number.isInteger(step.config.delayMinutes) &&
        (step.config.delayMinutes ?? 0) >= WAIT_MINUTES_MIN &&
        (step.config.delayMinutes ?? 0) <= WAIT_MINUTES_MAX,
    );
  }
  if (step.action === "recheck_order_status") {
    return Boolean(step.config.expectedStatus);
  }
  return Boolean(step.config.targetStatus);
}

function statusTargetsForStep(
  trigger: string,
  steps: readonly BuilderStep[],
  stepIndex: number,
): readonly SellerOrderStatusTarget[] {
  let statusAuthorityStale = false;
  let liveCheckedStatus: SellerOrderCheckStatus | null = null;

  for (let index = 0; index < stepIndex; index += 1) {
    const prior = steps[index];
    if (!prior) continue;
    if (prior.action === "wait") {
      statusAuthorityStale = true;
      liveCheckedStatus = null;
      continue;
    }
    if (
      prior.action === "recheck_order_status" &&
      prior.config.expectedStatus
    ) {
      statusAuthorityStale = false;
      liveCheckedStatus = prior.config.expectedStatus;
    }
  }

  if (statusAuthorityStale) return [];
  return liveCheckedStatus
    ? getSellerStatusTargetsFromStatus(liveCheckedStatus)
    : getSellerStatusTargets(trigger);
}

function stepCompatibleWithSequence(
  trigger: string,
  steps: readonly BuilderStep[],
  index: number,
): boolean {
  const step = steps[index];
  if (!step || !actionAllowedForTrigger(trigger, step.action)) return false;
  if (step.action === "update_status") {
    return Boolean(
      step.config.targetStatus &&
        statusTargetsForStep(trigger, steps, index).includes(
          step.config.targetStatus,
        ),
    );
  }
  if (step.action === "recheck_order_status") {
    return Boolean(
      step.config.expectedStatus &&
        getSellerRecheckStatuses(trigger).includes(step.config.expectedStatus),
    );
  }
  if (step.action === "wait") return true;
  const template =
    step.action === "tag_customer"
      ? step.config.noteText
      : step.config.messageTemplate;
  return template
    ? unsupportedTemplateVariablesForTrigger(trigger, template).length === 0
    : true;
}

function normalizeStepsForTrigger(
  trigger: SellerAutomationTrigger,
  currentSteps: readonly BuilderStep[],
  locale: string,
): BuilderStep[] {
  const spec = getSellerTriggerSpec(trigger);
  if (!spec) return [];
  const normalized: BuilderStep[] = [];

  for (const step of currentSteps) {
    if (!spec.actions.includes(step.action)) continue;

    if (step.action === "update_status") {
      const targets = statusTargetsForStep(trigger, normalized, normalized.length);
      if (targets.length === 0) continue;
      normalized.push(
        step.config.targetStatus && targets.includes(step.config.targetStatus)
          ? step
          : {
              ...step,
              config: { ...step.config, targetStatus: targets[0] },
            },
      );
      continue;
    }

    const candidateSteps = [...normalized, step];
    normalized.push(
      stepCompatibleWithSequence(
        trigger,
        candidateSteps,
        candidateSteps.length - 1,
      )
        ? step
        : defaultStep(step.action, locale, trigger),
    );
  }

  return normalized;
}

function conditionDrafts(value: SellerConditionGroupDraft): SellerConditionDraft[] {
  if (!value) return [];
  return "all" in value ? value.all : value.any;
}

function buildConditionsPayload(
  trigger: string,
  value: SellerConditionGroupDraft,
): unknown {
  if (!value) return null;
  const spec = getSellerTriggerSpec(trigger);
  if (!spec) return null;
  const drafts = conditionDrafts(value);
  const normalized = drafts.flatMap((condition) => {
    const field = spec.fields.find((item) => item.value === condition.field);
    if (!field || !field.operators.includes(condition.operator)) return [];
    return [
      {
        field: condition.field,
        operator: condition.operator,
        value: normalizeConditionValueForSubmit(
          condition.value,
          condition.operator,
          field.type,
        ),
      },
    ];
  });
  if (normalized.length === 0) return null;
  return "all" in value ? { all: normalized } : { any: normalized };
}

export function AutomationBuilder({ automation, preset, children }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const c = (
    key: AutomationWorkspaceCopyKey,
    params?: Record<string, string | number>,
  ) => getAutomationWorkspaceCopy(locale, key, params);
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(automation);

  const initialTrigger =
    automation && getSellerTriggerSpec(automation.trigger)
      ? (automation.trigger as SellerAutomationTrigger)
      : preset?.trigger ?? "order.created";
  const initialSteps = automation
    ? parseStoredSteps(automation, locale)
    : preset?.steps ?? [];
  const firstAllowed = getSellerTriggerSpec(initialTrigger)?.actions[0];

  const [name, setName] = useState(automation?.name ?? preset?.name ?? "");
  const [trigger, setTrigger] = useState<SellerAutomationTrigger>(initialTrigger);
  const [conditions, setConditions] = useState<SellerConditionGroupDraft>(
    automation ? parseStoredConditions(automation) : preset?.conditions ?? null,
  );
  const [steps, setSteps] = useState<BuilderStep[]>(
    initialSteps.length > 0
      ? initialSteps
      : firstAllowed
        ? [defaultStep(firstAllowed, locale, initialTrigger)]
        : [],
  );
  const [dryRun, setDryRun] = useState(automation?.dryRun ?? false);
  const [maxRetries, setMaxRetries] = useState(automation?.maxRetries ?? 2);
  const [retryDelayMs, setRetryDelayMs] = useState(
    automation?.retryDelayMs ?? 500,
  );
  const [loading, setLoading] = useState(false);

  const triggerSpec = getSellerTriggerSpec(trigger);
  const selectableTriggers = useMemo(() => {
    const ready = [...sellerReadyTriggers()];
    const current = getSellerTriggerSpec(trigger);
    if (current && !ready.some((item) => item.value === current.value)) {
      ready.push(current);
    }
    return ready;
  }, [trigger]);

  const legacyInvalid = Boolean(
    automation &&
      (!getSellerTriggerSpec(automation.trigger) ||
        (!isSellerAction(automation.action) && parseStoredSteps(automation, locale).length === 0)),
  );

  const conditionsValid = conditionDrafts(conditions).every((condition) => {
    const field = triggerSpec?.fields.find((item) => item.value === condition.field);
    if (!field || !field.operators.includes(condition.operator)) return false;
    if (condition.operator === "is_empty" || condition.operator === "is_not_empty") {
      return true;
    }
    if (!condition.value.trim()) return false;
    if (field.type === "number" && !["in", "not_in"].includes(condition.operator)) {
      return Number.isFinite(Number(condition.value));
    }
    if (field.type === "number" && ["in", "not_in"].includes(condition.operator)) {
      const parts = condition.value.split(",").map((item) => item.trim()).filter(Boolean);
      return parts.length > 0 && parts.every((item) => Number.isFinite(Number(item)));
    }
    return true;
  });

  const statusMutationCount = steps.filter(
    (step) => step.action === "update_status",
  ).length;
  const stepsCompatible =
    statusMutationCount <= 1 &&
    steps.every((_, index) => stepCompatibleWithSequence(trigger, steps, index));
  const valid =
    !legacyInvalid &&
    name.trim().length > 0 &&
    name.trim().length <= 120 &&
    Boolean(triggerSpec) &&
    steps.length > 0 &&
    steps.length <= 20 &&
    steps.every(stepComplete) &&
    stepsCompatible &&
    conditionsValid &&
    maxRetries >= 0 &&
    maxRetries <= 8 &&
    retryDelayMs >= 100 &&
    retryDelayMs <= 300_000;

  const updateStep = (index: number, update: Partial<BuilderStep>) => {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...update } : step,
      ),
    );
  };

  const updateStepConfig = (index: number, config: Partial<StepConfig>) => {
    setSteps((current) =>
      current.map((step, position) =>
        position === index
          ? { ...step, config: { ...step.config, ...config } }
          : step,
      ),
    );
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const selected = next[index];
      const displaced = next[target];
      if (!selected || !displaced) return current;
      next[index] = displaced;
      next[target] = selected;
      return next;
    });
  };

  const setTriggerSafely = (value: SellerAutomationTrigger) => {
    setTrigger(value);
    setConditions(null);
    const compatible = normalizeStepsForTrigger(value, steps, locale);
    if (compatible.length > 0) {
      setSteps(compatible);
      return;
    }
    const nextAction = getSellerTriggerSpec(value)?.actions[0];
    setSteps(nextAction ? [defaultStep(nextAction, locale, value)] : []);
  };

  const insertVariable = (index: number, variable: string) => {
    const step = steps[index];
    if (!step) return;
    const token = `{{${variable}}}`;
    if (step.action === "tag_customer") {
      updateStepConfig(index, {
        noteText: `${step.config.noteText ?? ""}${
          step.config.noteText ? " " : ""
        }${token}`,
      });
      return;
    }
    if (step.action !== "send_whatsapp" && step.action !== "send_notification") {
      return;
    }
    updateStepConfig(index, {
      messageTemplate: `${step.config.messageTemplate ?? ""}${
        step.config.messageTemplate ? " " : ""
      }${token}`,
    });
  };

  const resetCreateState = () => {
    if (isEdit) return;
    const resetTrigger = preset?.trigger ?? "order.created";
    const presetSteps = preset?.steps ?? [];
    const resetFirstAllowed = getSellerTriggerSpec(resetTrigger)?.actions[0];
    setName(preset?.name ?? "");
    setTrigger(resetTrigger);
    setConditions(preset?.conditions ?? null);
    setSteps(
      presetSteps.length > 0
        ? presetSteps
        : resetFirstAllowed
          ? [defaultStep(resetFirstAllowed, locale, resetTrigger)]
          : [],
    );
    setDryRun(false);
    setMaxRetries(2);
    setRetryDelayMs(500);
  };

  const handleSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const firstStep = steps[0];
      if (!firstStep) return;
      const payload = {
        name: name.trim(),
        trigger,
        action: firstStep.action,
        config: firstStep.config,
        steps,
        conditions: buildConditionsPayload(trigger, conditions),
        isActive: automation?.isActive ?? true,
        dryRun,
        maxRetries,
        retryDelayMs,
      };
      const response = isEdit
        ? await fetch(`/api/automations/${automation?.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/automations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? t("automations.updateFailed"));
      }
      toast.success(
        isEdit
          ? t("automations.editor.updated")
          : t("automations.editor.created"),
      );
      if (!isEdit) resetCreateState();
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("automations.updateFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const conditionCount = conditionDrafts(conditions).length;
  const triggerLabel = triggerSpec ? t(triggerSpec.labelKey) : trigger;
  const actionLabels = steps.map((step) => {
    const spec = getSellerActionSpec(step.action);
    return spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : step.action;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? <Button>{c("workspace.new")}</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] overflow-hidden p-0 sm:max-w-5xl">
        <div className="grid max-h-[94vh] min-h-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
            <DialogHeader className="mb-6 text-start">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </span>
                {isEdit ? c("builder.editTitle") : c("builder.createTitle")}
              </DialogTitle>
              <DialogDescription>{c("builder.subtitle")}</DialogDescription>
            </DialogHeader>

            {legacyInvalid ? (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>{c("builder.invalidLegacy")}</p>
              </div>
            ) : null}

            <div className="space-y-5">
              <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                <div className="space-y-1">
                  <Label htmlFor="automation-name-v2">{c("builder.name")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {c("builder.reviewHint")}
                  </p>
                </div>
                <Input
                  id="automation-name-v2"
                  value={name}
                  maxLength={120}
                  disabled={loading}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={c("builder.namePlaceholder")}
                />
              </section>

              <section className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Zap className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="automation-trigger-v2">
                      {c("builder.whenTitle")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {c("builder.whenHint")}
                    </p>
                  </div>
                </div>
                <Select
                  value={trigger}
                  disabled={loading}
                  onValueChange={(value) =>
                    setTriggerSafely(value as SellerAutomationTrigger)
                  }
                >
                  <SelectTrigger id="automation-trigger-v2" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableTriggers.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {t(item.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <SellerConditionBuilder
                trigger={trigger}
                value={conditions}
                onChange={setConditions}
                disabled={loading}
              />

              <section className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MessageCircle className="size-4" />
                    </span>
                    <div className="space-y-1">
                      <Label>{c("builder.thenTitle")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {c("builder.thenHint")}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      loading ||
                      steps.length >= 20 ||
                      (triggerSpec?.actions.length ?? 0) === 0
                    }
                    onClick={() => {
                      const nextAction = triggerSpec?.actions[0];
                      if (nextAction) {
                        setSteps((current) => [
                          ...current,
                          defaultStep(nextAction, locale, trigger),
                        ]);
                      }
                    }}
                  >
                    <Plus className="me-1.5 size-4" />
                    {c("builder.addAction")}
                  </Button>
                </div>

                {steps.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4 text-sm text-muted-foreground">
                    {c("builder.actionUnavailable")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {steps.map((step, index) => {
                      const statusTargets = statusTargetsForStep(
                        trigger,
                        steps,
                        index,
                      );
                      const availableActions = [...(triggerSpec?.actions ?? [])];
                      const statusActionUsedElsewhere = steps.some(
                        (candidate, position) =>
                          position !== index && candidate.action === "update_status",
                      );
                      const uniqueActions = [...new Set(availableActions)].filter(
                        (action) =>
                          action !== "update_status" ||
                          step.action === "update_status" ||
                          (!statusActionUsedElsewhere && statusTargets.length > 0),
                      );
                      const actionSpec = getSellerActionSpec(step.action);
                      const isWhatsApp = step.action === "send_whatsapp";
                      const isNotification = step.action === "send_notification";
                      const recheckStatuses = getSellerRecheckStatuses(trigger);
                      const template =
                        step.action === "tag_customer"
                          ? step.config.noteText ?? ""
                          : step.action === "send_whatsapp" ||
                              step.action === "send_notification"
                            ? step.config.messageTemplate ?? ""
                            : "";
                      const unsupportedVariables = template
                        ? unsupportedTemplateVariablesForTrigger(trigger, template)
                        : [];

                      return (
                        <article
                          key={`${index}-${step.action}`}
                          className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{index + 1}</Badge>
                              <span className="text-sm font-semibold">
                                {actionSpec
                                  ? c(
                                      actionSpec.copyKey as AutomationWorkspaceCopyKey,
                                    )
                                  : step.action}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={loading || index === 0}
                                onClick={() => moveStep(index, -1)}
                                aria-label={c("builder.moveUp")}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={loading || index === steps.length - 1}
                                onClick={() => moveStep(index, 1)}
                                aria-label={c("builder.moveDown")}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={loading || steps.length === 1}
                                onClick={() =>
                                  setSteps((current) =>
                                    current.filter(
                                      (_, position) => position !== index,
                                    ),
                                  )
                                }
                                aria-label={c("builder.removeAction")}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor={`automation-action-${index}`}>
                                {c("builder.action")}
                              </Label>
                              <Select
                                value={step.action}
                                disabled={loading}
                                onValueChange={(value) => {
                                  const action = value as SellerAutomationAction;
                                  if (action === "update_status") {
                                    const targetStatus = statusTargets[0];
                                    if (!targetStatus) return;
                                    updateStep(index, {
                                      action,
                                      onFailure: "stop",
                                      config: { targetStatus },
                                    });
                                    return;
                                  }
                                  updateStep(index, {
                                    ...defaultStep(action, locale, trigger),
                                  });
                                }}
                              >
                                <SelectTrigger
                                  id={`automation-action-${index}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {uniqueActions.map((action) => {
                                    const spec = getSellerActionSpec(action);
                                    return (
                                      <SelectItem key={action} value={action}>
                                        {spec
                                          ? c(
                                              spec.copyKey as AutomationWorkspaceCopyKey,
                                            )
                                          : action}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`automation-failure-${index}`}>
                                {c("builder.onFailure")}
                              </Label>
                              <Select
                                value={step.onFailure}
                                disabled={loading}
                                onValueChange={(value) =>
                                  updateStep(index, {
                                    onFailure: value as FailurePolicy,
                                  })
                                }
                              >
                                <SelectTrigger
                                  id={`automation-failure-${index}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stop">
                                    {c("builder.stop")}
                                  </SelectItem>
                                  <SelectItem value="continue">
                                    {c("builder.continue")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {(isWhatsApp || isNotification) && (
                            <div className="space-y-2">
                              <Label htmlFor={`automation-message-${index}`}>
                                {c("builder.message")}
                              </Label>
                              <Textarea
                                id={`automation-message-${index}`}
                                value={step.config.messageTemplate ?? ""}
                                maxLength={
                                  isWhatsApp
                                    ? WHATSAPP_MESSAGE_MAX_LENGTH
                                    : NOTIFICATION_MESSAGE_MAX_LENGTH
                                }
                                disabled={loading}
                                onChange={(event) =>
                                  updateStepConfig(index, {
                                    messageTemplate: event.target.value,
                                  })
                                }
                                className="min-h-28"
                              />
                              <div className="space-y-2 rounded-lg border border-border/60 bg-background/70 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-medium">
                                    {c("builder.variables")}
                                  </span>
                                  {(triggerSpec?.variables ?? []).map((variable) => (
                                    <button
                                      key={variable}
                                      type="button"
                                      dir="ltr"
                                      disabled={loading}
                                      onClick={() => insertVariable(index, variable)}
                                      className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                      {`{{${variable}}}`}
                                    </button>
                                  ))}
                                </div>
                                <p className="text-2xs text-muted-foreground">
                                  {c("builder.variablesHint")}
                                </p>
                              </div>
                              {unsupportedVariables.length > 0 ? (
                                <p className="text-xs text-destructive">
                                  {c("builder.variablesInvalid", {
                                    variables: unsupportedVariables
                                      .map((variable) => `{{${variable}}}`)
                                      .join(", "),
                                  })}
                                </p>
                              ) : null}
                              {isWhatsApp ? (
                                <p className="text-xs text-muted-foreground">
                                  {c("builder.whatsappNeedsPhone")}
                                </p>
                              ) : null}
                              {isNotification ? (
                                <p className="text-xs text-muted-foreground">
                                  {c("builder.notificationHint")}
                                </p>
                              ) : null}
                            </div>
                          )}

                          {step.action === "tag_customer" ? (
                            <div className="space-y-2">
                              <Label htmlFor={`automation-note-${index}`}>
                                {c("builder.customerNote")}
                              </Label>
                              <Textarea
                                id={`automation-note-${index}`}
                                value={step.config.noteText ?? ""}
                                maxLength={CUSTOMER_NOTE_MAX_LENGTH}
                                disabled={loading}
                                onChange={(event) =>
                                  updateStepConfig(index, {
                                    noteText: event.target.value,
                                  })
                                }
                                className="min-h-24"
                              />
                              <div className="flex flex-wrap gap-2">
                                {(triggerSpec?.variables ?? []).map((variable) => (
                                  <button
                                    key={variable}
                                    type="button"
                                    dir="ltr"
                                    disabled={loading}
                                    onClick={() => insertVariable(index, variable)}
                                    className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-2xs text-muted-foreground hover:text-foreground"
                                  >
                                    {`{{${variable}}}`}
                                  </button>
                                ))}
                              </div>
                              {unsupportedVariables.length > 0 ? (
                                <p className="text-xs text-destructive">
                                  {c("builder.variablesInvalid", {
                                    variables: unsupportedVariables
                                      .map((variable) => `{{${variable}}}`)
                                      .join(", "),
                                  })}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          {step.action === "wait" ? (
                            <div className="space-y-2">
                              <Label htmlFor={`automation-wait-${index}`}>
                                {c("builder.waitDuration")}
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  id={`automation-wait-${index}`}
                                  type="number"
                                  min={WAIT_MINUTES_MIN}
                                  max={WAIT_MINUTES_MAX}
                                  step={1}
                                  dir="ltr"
                                  value={step.config.delayMinutes ?? 120}
                                  disabled={loading}
                                  onChange={(event) =>
                                    updateStepConfig(index, {
                                      delayMinutes: Number(event.target.value),
                                    })
                                  }
                                />
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {c("builder.minutes")}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {c("builder.waitHint")}
                              </p>
                            </div>
                          ) : null}

                          {step.action === "recheck_order_status" ? (
                            <div className="space-y-2">
                              <Label htmlFor={`automation-recheck-${index}`}>
                                {c("builder.recheckStatus")}
                              </Label>
                              <Select
                                value={
                                  step.config.expectedStatus ??
                                  recheckStatuses[0] ??
                                  ""
                                }
                                disabled={loading || recheckStatuses.length === 0}
                                onValueChange={(value) =>
                                  updateStepConfig(index, {
                                    expectedStatus: value as SellerOrderCheckStatus,
                                  })
                                }
                              >
                                <SelectTrigger
                                  id={`automation-recheck-${index}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {recheckStatuses.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {t(`automations.status.${status}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                {c("builder.recheckHint")}
                              </p>
                            </div>
                          ) : null}

                          {step.action === "update_status" ? (
                            <div className="space-y-2">
                              <Label htmlFor={`automation-status-${index}`}>
                                {c("builder.orderStatus")}
                              </Label>
                              <Select
                                value={step.config.targetStatus ?? statusTargets[0] ?? ""}
                                disabled={loading || statusTargets.length === 0}
                                onValueChange={(value) =>
                                  updateStepConfig(index, {
                                    targetStatus: value as SellerOrderStatusTarget,
                                  })
                                }
                              >
                                <SelectTrigger
                                  id={`automation-status-${index}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusTargets.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {t(`automations.status.${status}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {statusTargets.length === 0 ? (
                                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                                  <span>{c("builder.statusNeedsRecheck")}</span>
                                </div>
                              ) : null}
                              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                                <span>{c("builder.statusWarning")}</span>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <details className="group rounded-xl border border-border/70 bg-card p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{c("builder.advanced")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c("builder.advancedHint")}
                    </p>
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="automation-retries-v2">
                      {c("builder.retries")}
                    </Label>
                    <Input
                      id="automation-retries-v2"
                      type="number"
                      min={0}
                      max={8}
                      dir="ltr"
                      value={maxRetries}
                      disabled={loading}
                      onChange={(event) => setMaxRetries(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="automation-delay-v2">
                      {c("builder.retryDelay")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="automation-delay-v2"
                        type="number"
                        min={100}
                        max={300000}
                        step={100}
                        dir="ltr"
                        value={retryDelayMs}
                        disabled={loading}
                        onChange={(event) =>
                          setRetryDelayMs(Number(event.target.value))
                        }
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c("builder.retryDelayUnit")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3 sm:col-span-2">
                    <div>
                      <Label htmlFor="automation-test-v2">
                        {c("builder.testMode")}
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c("builder.testModeHint")}
                      </p>
                    </div>
                    <Switch
                      id="automation-test-v2"
                      checked={dryRun}
                      disabled={loading}
                      onCheckedChange={setDryRun}
                    />
                  </div>
                </div>
              </details>

              <section className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {c("builder.reviewTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c("builder.reviewHint")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">
                        {c("builder.summaryWhen", { trigger: triggerLabel })}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="outline">
                        {c("builder.summaryIf", {
                          conditions:
                            conditionCount > 0
                              ? c("builder.conditionCount", {
                                  count: conditionCount,
                                })
                              : c("builder.noConditions"),
                        })}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="secondary">
                        {c("builder.summaryThen", {
                          actions: actionLabels.join(" · "),
                        })}
                      </Badge>
                    </div>
                    {dryRun ? (
                      <Badge variant="outline">{c("workspace.dryRun")}</Badge>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>

            <DialogFooter className="mt-6 border-t border-border/60 pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                {c("builder.cancel")}
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={!valid || loading}>
                {loading ? <Loader2 className="me-1.5 size-4 animate-spin" /> : null}
                {isEdit ? c("builder.save") : c("builder.create")}
              </Button>
            </DialogFooter>
          </div>

          <aside className="hidden min-h-0 border-s border-border/70 bg-muted/20 p-5 lg:block">
            <div className="sticky top-0 space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{c("builder.reviewTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {c("builder.reviewHint")}
                </p>
              </div>
              <div className="space-y-2">
                {[
                  [c("workspace.when"), triggerLabel],
                  [
                    c("workspace.onlyIf"),
                    conditionCount > 0
                      ? c("builder.conditionCount", { count: conditionCount })
                      : c("workspace.always"),
                  ],
                  [
                    c("workspace.then"),
                    actionLabels.length > 0 ? actionLabels.join(" · ") : "—",
                  ],
                ].map(([label, value], index) => (
                  <div key={String(label)} className="relative rounded-xl border border-border/70 bg-background p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {label}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <div
                className={cn(
                  "rounded-xl border p-3 text-xs",
                  valid
                    ? "border-success/30 bg-success/5 text-muted-foreground"
                    : "border-warning/40 bg-warning/5 text-muted-foreground",
                )}
              >
                {valid ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{c("builder.reviewHint")}</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span>{c("builder.actionUnavailable")}</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
