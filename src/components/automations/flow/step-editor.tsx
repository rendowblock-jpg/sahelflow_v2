"use client";

import { AlertTriangle, Info, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSellerActionSpec,
  getSellerRecheckStatuses,
  getSellerTriggerSpec,
  unsupportedTemplateVariablesForTrigger,
  type SellerAutomationAction,
  type SellerOrderCheckStatus,
  type SellerOrderStatusTarget,
} from "@/lib/automations/catalog";
import type { AutomationWorkspaceCopyKey } from "@/lib/i18n/automation-workspace";
import { cn } from "@/lib/utils";

import {
  CUSTOMER_NOTE_MAX_LENGTH,
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  WAIT_MINUTES_MAX,
  WAIT_MINUTES_MIN,
  WHATSAPP_MESSAGE_MAX_LENGTH,
  defaultStep,
  statusTargetsForStep,
  type BuilderStep,
  type FailurePolicy,
  type StepConfig,
} from "./flow-model";
import { ACTION_TONES, actionIcon, formatWait, useAutomationCopy, variableLabel } from "./flow-visuals";

const WAIT_PRESETS = [30, 60, 180, 1440] as const;

/** Every setting of one action step, as edited in the inspector. */
export function StepEditor({
  trigger,
  steps,
  index,
  disabled,
  onChange,
}: {
  trigger: string;
  steps: readonly BuilderStep[];
  index: number;
  disabled: boolean;
  onChange: (index: number, step: BuilderStep) => void;
}) {
  const { t, locale } = useI18n();
  const c = useAutomationCopy();
  const step = steps[index];
  if (!step) return null;

  const triggerSpec = getSellerTriggerSpec(trigger);
  const statusTargets = statusTargetsForStep(trigger, steps, index);
  const statusActionUsedElsewhere = steps.some(
    (candidate, position) => position !== index && candidate.action === "update_status",
  );
  // "Update order status" stays editable on existing steps but is not offered
  // for new ones (see flow.statusGoverned).
  const actions = [...new Set(triggerSpec?.actions ?? [])].filter(
    (action) => action !== "update_status" || (step.action === "update_status" && !statusActionUsedElsewhere),
  );
  const recheckStatuses = getSellerRecheckStatuses(trigger);
  const isWhatsApp = step.action === "send_whatsapp";
  const isNotification = step.action === "send_notification";
  const template =
    step.action === "tag_customer"
      ? step.config.noteText ?? ""
      : isWhatsApp || isNotification
        ? step.config.messageTemplate ?? ""
        : "";
  const unsupported = template ? unsupportedTemplateVariablesForTrigger(trigger, template) : [];

  const setConfig = (config: Partial<StepConfig>) =>
    onChange(index, { ...step, config: { ...step.config, ...config } });

  const changeAction = (action: SellerAutomationAction) => {
    if (action === "update_status") {
      const targetStatus = statusTargets[0];
      if (!targetStatus) return;
      onChange(index, { action, onFailure: "stop", config: { targetStatus } });
      return;
    }
    onChange(index, defaultStep(action, locale, trigger));
  };

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    if (step.action === "tag_customer") {
      const current = step.config.noteText ?? "";
      setConfig({ noteText: `${current}${current ? " " : ""}${token}` });
      return;
    }
    const current = step.config.messageTemplate ?? "";
    setConfig({ messageTemplate: `${current}${current ? " " : ""}${token}` });
  };

  const variableChips = (
    <div className="flex flex-wrap gap-1.5">
      {(triggerSpec?.variables ?? []).map((variable) => (
        <button
          key={variable}
          type="button"
          disabled={disabled}
          title={`{{${variable}}}`}
          data-automation-variable={variable}
          onClick={() => insertVariable(variable)}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-caption font-medium text-muted-foreground outline-none transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3" aria-hidden="true" />
          {variableLabel(variable, c)}
        </button>
      ))}
    </div>
  );

  const unsupportedNotice =
    unsupported.length > 0 ? (
      <p role="alert" className="flex items-start gap-1.5 text-caption text-destructive">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {c("builder.variablesInvalid", {
          variables: unsupported.map((variable) => `{{${variable}}}`).join(", "),
        })}
      </p>
    ) : null;

  return (
    <div className="space-y-5" data-automation-step-editor={index}>
      <div className="space-y-1.5">
        <Label htmlFor={`automation-action-${index}`}>{c("builder.action")}</Label>
        <Select value={step.action} disabled={disabled} onValueChange={(value) => changeAction(value as SellerAutomationAction)}>
          <SelectTrigger id={`automation-action-${index}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actions.map((action) => {
              const spec = getSellerActionSpec(action);
              const Icon = actionIcon(action);
              return (
                <SelectItem key={action} value={action}>
                  <span className="flex items-center gap-2">
                    <span className={cn("flex size-5 items-center justify-center rounded-[5px]", ACTION_TONES[action])}>
                      <Icon className="size-3" aria-hidden="true" />
                    </span>
                    {spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : action}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {isWhatsApp || isNotification ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`automation-message-${index}`}>{c("builder.message")}</Label>
            <span dir="ltr" className="text-caption tabular-nums text-muted-foreground">
              {(step.config.messageTemplate ?? "").length}/
              {isWhatsApp ? WHATSAPP_MESSAGE_MAX_LENGTH : NOTIFICATION_MESSAGE_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            id={`automation-message-${index}`}
            dir="auto"
            value={step.config.messageTemplate ?? ""}
            maxLength={isWhatsApp ? WHATSAPP_MESSAGE_MAX_LENGTH : NOTIFICATION_MESSAGE_MAX_LENGTH}
            disabled={disabled}
            onChange={(event) => setConfig({ messageTemplate: event.target.value })}
            className="min-h-32 resize-y"
          />
          <p className="text-caption font-medium text-muted-foreground">{c("builder.variables")}</p>
          {variableChips}
          {unsupportedNotice}
          {isWhatsApp ? <Hint>{c("builder.whatsappNeedsPhone")}</Hint> : <Hint>{c("builder.notificationHint")}</Hint>}
          {isWhatsApp && step.config.messageTemplate ? (
            <WhatsAppPreview text={step.config.messageTemplate} />
          ) : null}
        </div>
      ) : null}

      {step.action === "tag_customer" ? (
        <div className="space-y-2">
          <Label htmlFor={`automation-note-${index}`}>{c("builder.customerNote")}</Label>
          <Textarea
            id={`automation-note-${index}`}
            dir="auto"
            value={step.config.noteText ?? ""}
            maxLength={CUSTOMER_NOTE_MAX_LENGTH}
            disabled={disabled}
            onChange={(event) => setConfig({ noteText: event.target.value })}
            className="min-h-24 resize-y"
          />
          <p className="text-caption font-medium text-muted-foreground">{c("builder.variables")}</p>
          {variableChips}
          {unsupportedNotice}
        </div>
      ) : null}

      {step.action === "wait" ? (
        <div className="space-y-2">
          <Label htmlFor={`automation-wait-${index}`}>{c("builder.waitDuration")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`automation-wait-${index}`}
              type="number"
              min={WAIT_MINUTES_MIN}
              max={WAIT_MINUTES_MAX}
              step={1}
              dir="ltr"
              value={step.config.delayMinutes ?? 120}
              disabled={disabled}
              onChange={(event) => setConfig({ delayMinutes: Number(event.target.value) })}
            />
            <span className="shrink-0 text-caption text-muted-foreground">{c("builder.minutes")}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WAIT_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={disabled}
                aria-pressed={step.config.delayMinutes === minutes}
                onClick={() => setConfig({ delayMinutes: minutes })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-caption font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  step.config.delayMinutes === minutes
                    ? "border-primary bg-primary-subtle text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {formatWait(minutes, c)}
              </button>
            ))}
          </div>
          <Hint>{c("builder.waitHint")}</Hint>
        </div>
      ) : null}

      {step.action === "recheck_order_status" ? (
        <div className="space-y-2">
          <Label htmlFor={`automation-recheck-${index}`}>{c("builder.recheckStatus")}</Label>
          <Select
            value={step.config.expectedStatus ?? recheckStatuses[0] ?? ""}
            disabled={disabled || recheckStatuses.length === 0}
            onValueChange={(value) => setConfig({ expectedStatus: value as SellerOrderCheckStatus })}
          >
            <SelectTrigger id={`automation-recheck-${index}`} className="w-full">
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
          <Hint>{c("builder.recheckHint")}</Hint>
        </div>
      ) : null}

      {step.action === "update_status" ? (
        <div className="space-y-2">
          <Label htmlFor={`automation-status-${index}`}>{c("builder.orderStatus")}</Label>
          <Select
            value={step.config.targetStatus ?? statusTargets[0] ?? ""}
            disabled={disabled || statusTargets.length === 0}
            onValueChange={(value) => setConfig({ targetStatus: value as SellerOrderStatusTarget })}
          >
            <SelectTrigger id={`automation-status-${index}`} className="w-full">
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
          {statusTargets.length === 0 ? <Warning>{c("builder.statusNeedsRecheck")}</Warning> : null}
          <Warning>{c("flow.statusGoverned")}</Warning>
        </div>
      ) : null}

      <div className="space-y-1.5 border-t pt-4">
        <Label htmlFor={`automation-failure-${index}`}>{c("builder.onFailure")}</Label>
        <Select
          value={step.onFailure}
          disabled={disabled}
          onValueChange={(value) => onChange(index, { ...step, onFailure: value as FailurePolicy })}
        >
          <SelectTrigger id={`automation-failure-${index}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stop">{c("builder.stop")}</SelectItem>
            <SelectItem value="continue">{c("builder.continue")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-caption leading-5 text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-control border border-warning/40 bg-warning-subtle p-2.5 text-caption leading-5 text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Example values in the seller's language, so a template reads like the real message. */
const SAMPLE_VALUES: Record<string, Record<"en" | "fr" | "ar", string>> = {
  customerName: { en: "Amine", fr: "Amine", ar: "أمين" },
  customerPhone: { en: "0550 12 34 56", fr: "0550 12 34 56", ar: "0550 12 34 56" },
  orderNumber: { en: "SF-1024", fr: "SF-1024", ar: "SF-1024" },
  totalPrice: { en: "4,500", fr: "4 500", ar: "4500" },
  wilaya: { en: "Alger", fr: "Alger", ar: "الجزائر" },
  productName: { en: "Leather bag", fr: "Sac en cuir", ar: "حقيبة جلدية" },
  stockLevel: { en: "3", fr: "3", ar: "3" },
  lowStockThreshold: { en: "5", fr: "5", ar: "5" },
  messageText: { en: "Is it available in black?", fr: "Disponible en noir ?", ar: "متوفر باللون الأسود؟" },
};

/** How the WhatsApp message reads on the customer's phone, with example values. */
function WhatsAppPreview({ text }: { text: string }) {
  const { locale } = useI18n();
  const c = useAutomationCopy();
  const lang = (locale.startsWith("ar") ? "ar" : locale.startsWith("fr") ? "fr" : "en") as "en" | "fr" | "ar";
  const parts = text.split(/(\{\{[a-zA-Z]+\}\})/g);
  return (
    <div className="overflow-hidden rounded-surface border" data-automation-whatsapp-preview="true">
      <p className="border-b bg-muted/40 px-3 py-1.5 text-caption font-medium text-muted-foreground">{c("flow.previewTitle")}</p>
      <div className="bg-[color-mix(in_srgb,var(--success)_6%,var(--background))] p-3">
        <div
          dir="auto"
          className="ms-auto w-fit max-w-[92%] whitespace-pre-wrap rounded-[12px] rounded-ee-[4px] bg-success-soft px-3 py-2 text-body-sm leading-5 text-foreground shadow-(--elevation-1)"
        >
          {parts.map((part, position) => {
            const name = /^\{\{([a-zA-Z]+)\}\}$/.exec(part)?.[1];
            if (!name) return <span key={position}>{part}</span>;
            const sample = SAMPLE_VALUES[name]?.[lang] ?? name;
            return (
              <span key={position} className="rounded-[4px] bg-success/15 px-0.5 font-semibold text-success">
                {sample}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
