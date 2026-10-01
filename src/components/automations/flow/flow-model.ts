import {
  actionAllowedForTrigger,
  conditionValueForEditor,
  getSellerRecheckStatuses,
  getSellerStatusTargets,
  getSellerStatusTargetsFromStatus,
  getSellerTriggerSpec,
  normalizeConditionValueForSubmit,
  unsupportedTemplateVariablesForTrigger,
  type SellerAutomationAction,
  type SellerAutomationTrigger,
  type SellerConditionOperator,
  type SellerOrderCheckStatus,
  type SellerOrderStatusTarget,
} from "@/lib/automations/catalog";
import type {
  SellerConditionDraft,
  SellerConditionGroupDraft,
} from "@/components/automations/seller-condition-builder";

/**
 * The automation flow model: defaults, parsing of stored definitions and the
 * seller-safety rules (trigger/action compatibility, status authority after a
 * wait, template variables). Pure, so the canvas, the inspector and the save
 * payload all judge a flow the same way.
 */

export type FailurePolicy = "stop" | "continue";
export type StepConfig = {
  messageTemplate?: string;
  noteText?: string;
  targetStatus?: SellerOrderStatusTarget;
  delayMinutes?: number;
  expectedStatus?: SellerOrderCheckStatus;
};
export type BuilderStep = {
  action: SellerAutomationAction;
  onFailure: FailurePolicy;
  config: StepConfig;
};

export const WHATSAPP_MESSAGE_MAX_LENGTH = 4_000;
export const NOTIFICATION_MESSAGE_MAX_LENGTH = 1_000;
export const CUSTOMER_NOTE_MAX_LENGTH = 500;
export const WAIT_MINUTES_MIN = 1;
export const WAIT_MINUTES_MAX = 10_080;

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

export function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function isSellerAction(value: unknown): value is SellerAutomationAction {
  return [
    "send_whatsapp",
    "update_status",
    "tag_customer",
    "send_notification",
    "wait",
    "recheck_order_status",
  ].includes(String(value));
}

export function defaultMessage(trigger: string, locale: string): string {
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

export function defaultNotificationMessage(trigger: string, locale: string): string {
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

export function defaultNote(trigger: string, locale: string): string {
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

export function defaultRecheckStatus(trigger: string): SellerOrderCheckStatus {
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

export function defaultStep(
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

export function parseStoredSteps(
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

export function parseStoredConditions(
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

export function stepComplete(step: BuilderStep): boolean {
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

export function statusTargetsForStep(
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

export function stepCompatibleWithSequence(
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

export function normalizeStepsForTrigger(
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

export function conditionDrafts(value: SellerConditionGroupDraft): SellerConditionDraft[] {
  if (!value) return [];
  return "all" in value ? value.all : value.any;
}

export function buildConditionsPayload(
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


export function conditionsValidForTrigger(
  trigger: string,
  conditions: SellerConditionGroupDraft,
): boolean {
  const triggerSpec = getSellerTriggerSpec(trigger);
  return conditionDrafts(conditions).every((condition) => {
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
}

/** Where a problem lives in the flow, so the canvas can point at it. */
export type FlowIssueTarget = "name" | "trigger" | "conditions" | "steps" | "settings" | `step-${number}`;
export type FlowIssueCode =
  | "nameRequired"
  | "nameTooLong"
  | "triggerUnsupported"
  | "conditionsInvalid"
  | "noSteps"
  | "tooManySteps"
  | "stepIncomplete"
  | "stepIncompatible"
  | "oneStatusChange"
  | "retriesOutOfRange"
  | "retryDelayOutOfRange";
export type FlowIssue = { target: FlowIssueTarget; code: FlowIssueCode };

export interface FlowDraft {
  name: string;
  trigger: SellerAutomationTrigger;
  conditions: SellerConditionGroupDraft;
  steps: BuilderStep[];
  dryRun: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Every reason the flow cannot be saved, in canvas order. An empty list is
 * exactly the condition the previous builder used for `valid`.
 */
export function flowIssues(flow: FlowDraft): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const name = flow.name.trim();
  if (!name) issues.push({ target: "name", code: "nameRequired" });
  else if (name.length > 120) issues.push({ target: "name", code: "nameTooLong" });
  if (!getSellerTriggerSpec(flow.trigger)) issues.push({ target: "trigger", code: "triggerUnsupported" });
  if (!conditionsValidForTrigger(flow.trigger, flow.conditions)) {
    issues.push({ target: "conditions", code: "conditionsInvalid" });
  }
  if (flow.steps.length === 0) issues.push({ target: "steps", code: "noSteps" });
  if (flow.steps.length > 20) issues.push({ target: "steps", code: "tooManySteps" });
  if (flow.steps.filter((step) => step.action === "update_status").length > 1) {
    issues.push({ target: "steps", code: "oneStatusChange" });
  }
  flow.steps.forEach((step, index) => {
    if (!stepComplete(step)) issues.push({ target: `step-${index}`, code: "stepIncomplete" });
    else if (!stepCompatibleWithSequence(flow.trigger, flow.steps, index)) {
      issues.push({ target: `step-${index}`, code: "stepIncompatible" });
    }
  });
  if (!(flow.maxRetries >= 0 && flow.maxRetries <= 8)) {
    issues.push({ target: "settings", code: "retriesOutOfRange" });
  }
  if (!(flow.retryDelayMs >= 100 && flow.retryDelayMs <= 300_000)) {
    issues.push({ target: "settings", code: "retryDelayOutOfRange" });
  }
  return issues;
}

/** The exact body the automations API accepts (POST and PATCH). */
export function flowPayload(flow: FlowDraft, isActive: boolean) {
  const firstStep = flow.steps[0];
  return {
    name: flow.name.trim(),
    trigger: flow.trigger,
    action: firstStep?.action,
    config: firstStep?.config,
    steps: flow.steps,
    conditions: buildConditionsPayload(flow.trigger, flow.conditions),
    isActive,
    dryRun: flow.dryRun,
    maxRetries: flow.maxRetries,
    retryDelayMs: flow.retryDelayMs,
  };
}
