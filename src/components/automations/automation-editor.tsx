"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import {
  ConditionBuilder,
  type ConditionGroup,
} from "@/components/automations/condition-builder";
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
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

type EditorAction =
  | "send_whatsapp"
  | "send_notification"
  | "tag_customer"
  | "update_status";
type FailurePolicy = "stop" | "continue";
type EditorStepConfig = {
  messageTemplate?: string;
  noteText?: string;
  targetStatus?:
    | "shipped"
    | "delivered"
    | "returned"
    | "refused"
    | "cancelled"
    | "failed";
};
type EditorStep = {
  action: EditorAction;
  onFailure: FailurePolicy;
  config: EditorStepConfig;
};

const TRIGGERS = [
  { value: "order.created", labelKey: "automations.triggers.orderCreated" },
  { value: "order.confirmed", labelKey: "automations.triggers.orderConfirmed" },
  { value: "order.shipped", labelKey: "automations.triggers.orderShipped" },
  { value: "order.delivered", labelKey: "automations.triggers.orderDelivered" },
  { value: "order.returned", labelKey: "automations.triggers.orderReturned" },
  { value: "order.refused", labelKey: "automations.triggers.orderRefused" },
  { value: "order.cancelled", labelKey: "automations.triggers.orderCancelled" },
  { value: "order.failed", labelKey: "automations.triggers.orderFailed" },
  {
    value: "customer.blacklisted",
    labelKey: "automations.triggers.customerBlacklisted",
  },
  { value: "message.received", labelKey: "automations.triggers.messageReceived" },
  { value: "stock.low", labelKey: "automations.triggers.stockLow" },
] as const;

const ACTIONS: Array<{ value: EditorAction; labelKey: string }> = [
  { value: "send_whatsapp", labelKey: "automations.actions.sendWhatsapp" },
  { value: "update_status", labelKey: "automations.actions.updateStatus" },
  { value: "send_notification", labelKey: "automations.actions.sendNotification" },
  { value: "tag_customer", labelKey: "automations.actions.tagCustomer" },
];

const TARGET_STATUSES = [
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
  "failed",
] as const;

function defaultConfig(action: EditorAction): EditorStepConfig {
  switch (action) {
    case "send_whatsapp":
      return {
        messageTemplate:
          "Bonjour {{customerName}}, votre commande {{orderNumber}} a été mise à jour.",
      };
    case "send_notification":
      return { messageTemplate: "Automation: {{orderNumber}}" };
    case "tag_customer":
      return { noteText: "Automation: {{orderNumber}}" };
    case "update_status":
      return { targetStatus: "shipped" };
  }
}

function newStep(action: EditorAction = "send_whatsapp"): EditorStep {
  return { action, onFailure: "stop", config: defaultConfig(action) };
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isAction(value: unknown): value is EditorAction {
  return ACTIONS.some((action) => action.value === value);
}

function parseStoredSteps(automation?: AutomationEditorAutomation): EditorStep[] {
  if (!automation) return [newStep()];
  const raw = parseJson(automation.steps);
  if (Array.isArray(raw)) {
    const parsed = raw.flatMap((entry): EditorStep[] => {
      if (!entry || typeof entry !== "object") return [];
      const object = entry as Record<string, unknown>;
      if (!isAction(object.action)) return [];
      const onFailure = object.onFailure === "continue" ? "continue" : "stop";
      const config =
        object.config && typeof object.config === "object"
          ? (object.config as EditorStepConfig)
          : defaultConfig(object.action);
      return [{ action: object.action, onFailure, config }];
    });
    if (parsed.length > 0) return parsed;
  }
  const action = isAction(automation.action) ? automation.action : "send_whatsapp";
  const config = parseJson(automation.config);
  return [
    {
      action,
      onFailure: "stop",
      config:
        config && typeof config === "object"
          ? (config as EditorStepConfig)
          : defaultConfig(action),
    },
  ];
}

function parseConditions(raw: string | null | undefined): ConditionGroup | null {
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === "object") {
    const object = parsed as Record<string, unknown>;
    if (Array.isArray(object.all) || Array.isArray(object.any)) {
      return object as unknown as ConditionGroup;
    }
  }
  return null;
}

function stepIsComplete(step: EditorStep): boolean {
  switch (step.action) {
    case "send_whatsapp":
    case "send_notification":
      return Boolean(step.config.messageTemplate?.trim());
    case "tag_customer":
      return Boolean(step.config.noteText?.trim());
    case "update_status":
      return Boolean(step.config.targetStatus);
  }
}

export interface AutomationEditorAutomation {
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

interface AutomationEditorProps {
  automation?: AutomationEditorAutomation;
  children?: ReactNode;
}

export function AutomationEditor({ automation, children }: AutomationEditorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(automation);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant={isEdit ? "ghost" : "default"} size={isEdit ? "sm" : "default"}>
            {isEdit ? t("common.edit") : t("automations.newAutomation")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <AutomationEditorForm
          automation={automation}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface AutomationEditorFormProps {
  automation?: AutomationEditorAutomation;
  onDone: () => void;
}

function AutomationEditorForm({ automation, onDone }: AutomationEditorFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(automation);
  const initialTrigger = TRIGGERS.some((item) => item.value === automation?.trigger)
    ? automation!.trigger
    : TRIGGERS[0].value;

  const [name, setName] = useState(automation?.name ?? "");
  const [trigger, setTrigger] = useState(initialTrigger);
  const [conditions, setConditions] = useState<ConditionGroup | null>(
    parseConditions(automation?.conditions),
  );
  const [steps, setSteps] = useState<EditorStep[]>(parseStoredSteps(automation));
  const [dryRun, setDryRun] = useState(automation?.dryRun ?? false);
  const [maxRetries, setMaxRetries] = useState(automation?.maxRetries ?? 2);
  const [retryDelayMs, setRetryDelayMs] = useState(
    automation?.retryDelayMs ?? 500,
  );
  const [loading, setLoading] = useState(false);

  const updateStep = (index: number, update: Partial<EditorStep>) => {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...update } : step,
      ),
    );
  };

  const updateStepAction = (index: number, action: EditorAction) => {
    updateStep(index, { action, config: defaultConfig(action) });
  };

  const updateStepConfig = (index: number, config: Partial<EditorStepConfig>) => {
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

  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every(stepIsComplete) &&
    maxRetries >= 0 &&
    maxRetries <= 8 &&
    retryDelayMs >= 100 &&
    retryDelayMs <= 300_000;

  const handleSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        trigger,
        action: steps[0]!.action,
        config: steps[0]!.config,
        steps,
        conditions,
        isActive: automation?.isActive ?? true,
        dryRun,
        maxRetries,
        retryDelayMs,
      };
      const response = isEdit
        ? await fetch(`/api/automations/${automation!.id}`, {
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
        throw new Error(body?.error ?? "Automation validation failed");
      }
      toast.success(
        isEdit
          ? t("automations.editor.updated")
          : t("automations.editor.created"),
      );
      onDone();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("automations.updateFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit
            ? t("automations.editor.editTitle")
            : t("automations.editor.createTitle")}
        </DialogTitle>
        <DialogDescription>
          {t("automations.editor.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="automation-name">
            {t("automations.editor.nameLabel")}
          </Label>
          <Input
            id="automation-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("automations.editor.namePlaceholder")}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="automation-trigger">
            {t("automations.triggerLabel")}
          </Label>
          <Select value={trigger} onValueChange={setTrigger} disabled={loading}>
            <SelectTrigger id="automation-trigger" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {t(item.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("automations.runtime.noUnsupportedTriggers")}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>{t("automations.runtime.steps")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("automations.runtime.templateHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || steps.length >= 20}
              onClick={() => setSteps((current) => [...current, newStep()])}
            >
              <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t("automations.runtime.addStep")}
            </Button>
          </div>

          {steps.map((step, index) => (
            <section
              key={`${index}-${step.action}`}
              className="space-y-3 rounded-lg border bg-muted/20 p-4"
              aria-labelledby={`automation-step-${index}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 id={`automation-step-${index}`} className="text-sm font-semibold">
                  {t("automations.runtime.step", { count: index + 1 })}
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("automations.runtime.moveUp")}
                    disabled={loading || index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("automations.runtime.moveDown")}
                    disabled={loading || index === steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("automations.runtime.removeStep")}
                    disabled={loading || steps.length === 1}
                    onClick={() =>
                      setSteps((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`automation-action-${index}`}>
                    {t("automations.editor.actionLabel")}
                  </Label>
                  <Select
                    value={step.action}
                    onValueChange={(value) =>
                      updateStepAction(index, value as EditorAction)
                    }
                    disabled={loading}
                  >
                    <SelectTrigger id={`automation-action-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          {t(action.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`automation-failure-${index}`}>
                    {t("automations.runtime.failurePolicy")}
                  </Label>
                  <Select
                    value={step.onFailure}
                    onValueChange={(value) =>
                      updateStep(index, {
                        onFailure: value as FailurePolicy,
                      })
                    }
                    disabled={loading}
                  >
                    <SelectTrigger id={`automation-failure-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stop">
                        {t("automations.runtime.stop")}
                      </SelectItem>
                      <SelectItem value="continue">
                        {t("automations.runtime.continue")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(step.action === "send_whatsapp" ||
                step.action === "send_notification") && (
                <div className="space-y-1.5">
                  <Label htmlFor={`automation-template-${index}`}>
                    {t("automations.runtime.messageTemplate")}
                  </Label>
                  <textarea
                    id={`automation-template-${index}`}
                    dir="auto"
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={step.config.messageTemplate ?? ""}
                    onChange={(event) =>
                      updateStepConfig(index, {
                        messageTemplate: event.target.value,
                      })
                    }
                    disabled={loading}
                  />
                </div>
              )}

              {step.action === "tag_customer" && (
                <div className="space-y-1.5">
                  <Label htmlFor={`automation-note-${index}`}>
                    {t("automations.runtime.noteText")}
                  </Label>
                  <textarea
                    id={`automation-note-${index}`}
                    dir="auto"
                    className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={step.config.noteText ?? ""}
                    onChange={(event) =>
                      updateStepConfig(index, { noteText: event.target.value })
                    }
                    disabled={loading}
                  />
                </div>
              )}

              {step.action === "update_status" && (
                <div className="space-y-2">
                  <Label htmlFor={`automation-status-${index}`}>
                    {t("automations.runtime.targetStatus")}
                  </Label>
                  <Select
                    value={step.config.targetStatus ?? "shipped"}
                    onValueChange={(value) =>
                      updateStepConfig(index, {
                        targetStatus: value as EditorStepConfig["targetStatus"],
                      })
                    }
                    disabled={loading}
                  >
                    <SelectTrigger id={`automation-status-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`automations.status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div
                    role="note"
                    className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t("automations.editor.destructiveWarning")}</span>
                  </div>
                </div>
              )}

              {!stepIsComplete(step) && (
                <p role="alert" className="text-xs text-destructive">
                  {t("automations.runtime.requiredConfig")}
                </p>
              )}
            </section>
          ))}
        </div>

        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="automation-max-retries">
              {t("automations.runtime.maxRetries")}
            </Label>
            <Input
              id="automation-max-retries"
              type="number"
              min={0}
              max={8}
              value={maxRetries}
              onChange={(event) => setMaxRetries(Number(event.target.value))}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="automation-retry-delay">
              {t("automations.runtime.retryDelay")}
            </Label>
            <Input
              id="automation-retry-delay"
              type="number"
              min={100}
              max={300000}
              step={100}
              value={retryDelayMs}
              onChange={(event) => setRetryDelayMs(Number(event.target.value))}
              disabled={loading}
            />
          </div>
          <label className="flex items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
              disabled={loading}
            />
            <span className="text-sm">{t("automations.runtime.dryRun")}</span>
          </label>
        </div>

        <div className="space-y-1.5">
          <Label>{t("conditionBuilder.title")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("automations.editor.conditionsHint")}
          </p>
          <ConditionBuilder value={conditions} onChange={setConditions} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={loading}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={loading || !valid}>
          {loading ? (
            <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
          ) : null}
          {isEdit ? t("common.saveChanges") : t("common.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
