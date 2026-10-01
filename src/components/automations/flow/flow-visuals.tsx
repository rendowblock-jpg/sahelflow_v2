"use client";

import {
  Ban,
  Bell,
  CheckCircle2,
  Clock,
  MessageCircle,
  MessagesSquare,
  PackageCheck,
  PackageMinus,
  RotateCcw,
  SearchCheck,
  ShoppingBag,
  StickyNote,
  Truck,
  UserX,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { createElement } from "react";

import { useI18n } from "@/hooks/use-i18n";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";

/** One icon per trigger, so a flow reads at a glance on cards and canvas. */
export const TRIGGER_ICONS: Record<string, LucideIcon> = {
  "order.created": ShoppingBag,
  "order.confirmed": CheckCircle2,
  "order.shipped": Truck,
  "order.delivered": PackageCheck,
  "order.returned": RotateCcw,
  "order.refused": XCircle,
  "order.cancelled": Ban,
  "customer.blacklisted": UserX,
  "message.received": MessagesSquare,
  "stock.low": PackageMinus,
};

export const ACTION_ICONS: Record<string, LucideIcon> = {
  send_whatsapp: MessageCircle,
  update_status: Truck,
  tag_customer: StickyNote,
  send_notification: Bell,
  wait: Clock,
  recheck_order_status: SearchCheck,
};

/** Tone classes per action family (message, change, note, alert, timing). */
export const ACTION_TONES: Record<string, string> = {
  send_whatsapp: "bg-success-soft text-success",
  update_status: "bg-warning-soft text-warning",
  tag_customer: "bg-info-soft text-info",
  send_notification: "bg-primary-soft text-primary",
  wait: "bg-muted text-muted-foreground",
  recheck_order_status: "bg-muted text-muted-foreground",
};

export function triggerIcon(trigger: string): LucideIcon {
  return TRIGGER_ICONS[trigger] ?? Zap;
}

export function actionIcon(action: string): LucideIcon {
  return ACTION_ICONS[action] ?? Zap;
}

/** The automation copy in the dashboard locale, with `{{param}}` interpolation. */
export function useAutomationCopy() {
  const { locale } = useI18n();
  return (key: AutomationWorkspaceCopyKey, params?: Record<string, string | number>) =>
    getAutomationWorkspaceCopy(locale, key, params);
}

/** "45 min", "3 h", "2 d" — the wait shown on canvas and cards. */
export function formatWait(
  minutes: number,
  c: ReturnType<typeof useAutomationCopy>,
): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return c("flow.days", { count: minutes / 1440 });
  if (minutes >= 60 && minutes % 60 === 0) return c("flow.hours", { count: minutes / 60 });
  return c("flow.minutes", { count: minutes });
}

/** The trigger's icon as an element (no component is created during render). */
export function TriggerGlyph({ trigger, className }: { trigger: string; className?: string }) {
  return createElement(triggerIcon(trigger), { className, "aria-hidden": true });
}

export function ActionGlyph({ action, className }: { action: string; className?: string }) {
  return createElement(actionIcon(action), { className, "aria-hidden": true });
}

/** A template variable in the seller's words ("Customer name"), never `{{customerName}}`. */
export function variableLabel(variable: string, c: ReturnType<typeof useAutomationCopy>): string {
  const key = `condition.${variable}` as AutomationWorkspaceCopyKey;
  const label = c(key);
  return label && label !== key ? label : variable;
}

/** Message text with every `{{variable}}` shown as ‹Customer name›. */
export function readableTemplate(text: string, c: ReturnType<typeof useAutomationCopy>): string {
  return text.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, variable: string) => `‹${variableLabel(variable, c)}›`);
}
