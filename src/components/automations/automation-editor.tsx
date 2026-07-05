"use client";

/**
 * AutomationEditor — Dialog form for creating/editing an automation.
 *
 * Wires the existing ConditionBuilder into a full editor (C-audit S3-1):
 * name + trigger + action + conditions (JSON-logic). POSTs on create, PATCHes
 * on edit. Triggered by AutomationActions "create" / "edit" variants.
 *
 * The API stores `conditions` as a JSON string (db.automation.conditions).
 * This component serializes the ConditionGroup on submit; the API re-parses
 * it with z.any() (permissive — engine.ts evaluates it via evaluateConditions).
 *
 * State pattern: the parent AutomationEditor holds only the `open` state. The
 * form state lives in AutomationEditorForm, which radix mounts fresh inside
 * DialogContent each time the dialog opens (DialogContent unmounts on close).
 * This avoids setState-in-effect cascading renders.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ConditionBuilder,
  type ConditionGroup,
} from "@/components/automations/condition-builder";

/** Trigger events — same as automations/page.tsx TRIGGER_I18N map. */
const TRIGGERS = [
  { value: "order.created", labelKey: "automations.triggers.orderCreated" },
  { value: "order.confirmed", labelKey: "automations.triggers.orderConfirmed" },
  { value: "order.shipped", labelKey: "automations.triggers.orderShipped" },
  { value: "order.delivered", labelKey: "automations.triggers.orderDelivered" },
  { value: "order.returned", labelKey: "automations.triggers.orderReturned" },
  { value: "customer.created", labelKey: "automations.triggers.customerCreated" },
  { value: "message.received", labelKey: "automations.triggers.messageReceived" },
  { value: "stock.low", labelKey: "automations.triggers.stockLow" },
] as const;

/** Actions — same as automations/page.tsx ACTION_I18N map. */
const ACTIONS = [
  { value: "send_whatsapp", labelKey: "automations.actions.sendWhatsapp" },
  { value: "update_status", labelKey: "automations.actions.updateStatus" },
  { value: "send_notification", labelKey: "automations.actions.sendNotification" },
  { value: "tag_customer", labelKey: "automations.actions.tagCustomer" },
] as const;

export interface AutomationEditorAutomation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  isActive: boolean;
  conditions?: string | null; // JSON string from DB
}

interface AutomationEditorProps {
  /** Existing automation to edit (omitted/undefined → create mode). */
  automation?: AutomationEditorAutomation;
  /** Trigger element (DialogTrigger asChild). Defaults to a built-in button. */
  children?: ReactNode;
}

function parseConditions(raw: string | null | undefined): ConditionGroup | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.all || parsed.any)) return parsed as ConditionGroup;
    return null;
  } catch {
    return null;
  }
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Radix unmounts DialogContent on close, so AutomationEditorForm mounts
            fresh each open → useState initializers re-run, no useEffect reset. */}
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

  const [name, setName] = useState(automation?.name ?? "");
  const [trigger, setTrigger] = useState(automation?.trigger ?? TRIGGERS[0].value);
  const [action, setAction] = useState(automation?.action ?? ACTIONS[0].value);
  const [conditions, setConditions] = useState<ConditionGroup | null>(
    parseConditions(automation?.conditions),
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !trigger || !action) return;
    setLoading(true);
    try {
      const payload = { name: name.trim(), trigger, action, conditions };
      const res = isEdit
        ? await fetch(`/api/automations/${automation!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/automations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, isActive: true }),
          });
      if (!res.ok) throw new Error("Failed");
      toast.success(
        isEdit
          ? t("automations.editor.updated")
          : t("automations.editor.created") || t("automations.created"),
      );
      onDone();
      router.refresh();
    } catch {
      toast.error(t("automations.updateFailed") || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? t("automations.editor.editTitle") : t("automations.editor.createTitle")}
        </DialogTitle>
        <DialogDescription>
          {t("automations.editor.description") || t("automations.subtitle")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="automation-name">{t("automations.editor.nameLabel")}</Label>
          <Input
            id="automation-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("automations.editor.namePlaceholder") || t("automations.newAutomation")}
            disabled={loading}
          />
        </div>

        {/* Trigger */}
        <div className="space-y-1.5">
          <Label htmlFor="automation-trigger">{t("automations.triggerLabel")}</Label>
          <Select value={trigger} onValueChange={setTrigger} disabled={loading}>
            <SelectTrigger id="automation-trigger" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGERS.map((tr) => (
                <SelectItem key={tr.value} value={tr.value}>
                  {t(tr.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action */}
        <div className="space-y-1.5">
          <Label htmlFor="automation-action">{t("automations.editor.actionLabel")}</Label>
          <Select value={action} onValueChange={setAction} disabled={loading}>
            <SelectTrigger id="automation-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((ac) => (
                <SelectItem key={ac.value} value={ac.value}>
                  {t(ac.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Conditions */}
        <div className="space-y-1.5">
          <Label>{t("conditionBuilder.title") || t("automations.editor.conditionsLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("automations.editor.conditionsHint")}
          </p>
          <ConditionBuilder value={conditions} onChange={setConditions} />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={onDone}
          disabled={loading}
        >
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading || !name.trim() || !trigger || !action}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
          ) : null}
          {isEdit ? t("common.saveChanges") : t("common.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
