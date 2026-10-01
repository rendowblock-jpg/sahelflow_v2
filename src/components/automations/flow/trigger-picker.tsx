"use client";

import { Check } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  sellerReadyTriggers,
  getSellerTriggerSpec,
  type SellerAutomationTrigger,
  type SellerTriggerSpec,
} from "@/lib/automations/catalog";
import { cn } from "@/lib/utils";

import { triggerIcon, useAutomationCopy } from "./flow-visuals";

const GROUPS: ReadonlyArray<SellerTriggerSpec["group"]> = ["orders", "customers", "messages", "inventory"];

/** The events that can start an automation, grouped and chosen as cards. */
export function TriggerPicker({
  value,
  disabled,
  onChange,
}: {
  value: SellerAutomationTrigger;
  disabled: boolean;
  onChange: (trigger: SellerAutomationTrigger) => void;
}) {
  const { t } = useI18n();
  const c = useAutomationCopy();
  const triggers = [...sellerReadyTriggers()];
  const current = getSellerTriggerSpec(value);
  if (current && !triggers.some((item) => item.value === current.value)) triggers.push(current);

  return (
    <div id="automation-trigger-v2" role="radiogroup" aria-label={c("builder.whenTitle")} className="space-y-4">
      {GROUPS.map((group) => {
        const items = triggers.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-1.5">
            <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              {c(`flow.group.${group}`)}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((item) => {
                const selected = item.value === value;
                const Icon = triggerIcon(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    data-automation-trigger-option={item.value}
                    onClick={() => onChange(item.value)}
                    className={cn(
                      "relative flex min-h-11 items-center gap-2 rounded-control border px-2.5 py-2 text-start text-body-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                      selected ? "border-primary bg-primary-subtle text-foreground" : "hover:border-primary/40 hover:bg-muted/50",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                    <span className="min-w-0 flex-1 leading-4">{t(item.labelKey)}</span>
                    {selected ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
