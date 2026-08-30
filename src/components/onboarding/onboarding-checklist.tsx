"use client";

import { Bot, Check, CircleDashed, MessageCircle, Rocket, Store, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

/**
 * Persistent setup checklist (R4-b) — the Shopify-style personalized setup
 * checklist pattern (worklog d7-a) applied to SahelFlow onboarding.
 *
 * Every item is a button that jumps to its wizard step, so a skipped step is
 * always returnable. Completion markers are DERIVED from real configuration
 * state (not self-reported "next" clicks) — see onboarding-wizard.tsx.
 * Renders as a vertical rail beside the step card on desktop and collapses to
 * a compact chip strip on mobile.
 */
export type OnboardingChecklistItemId = "shop" | "whatsapp" | "couriers" | "ai";

export interface OnboardingChecklistItem {
  id: OnboardingChecklistItemId;
  /** 0-based wizard step index this item links to. */
  step: number;
  done: boolean;
}

const ITEM_ICONS = {
  shop: Store,
  whatsapp: MessageCircle,
  couriers: Truck,
  ai: Bot,
} as const;

export function OnboardingChecklist({
  items,
  currentStep,
  finished,
  onSelectStep,
  onSelectFinish,
}: {
  items: OnboardingChecklistItem[];
  /** Active wizard screen (0..3 steps, 4 = "You're ready" summary). */
  currentStep: number;
  /** True once the seller reached the summary screen at least once. */
  finished: boolean;
  onSelectStep: (step: number) => void;
  onSelectFinish: () => void;
}) {
  const { t } = useI18n();
  const doneCount = items.filter((item) => item.done).length;
  const progressCopy = t("onboarding.checklist.progress", {
    done: doneCount,
    total: items.length,
  });

  return (
    <aside
      data-onboarding-checklist="true"
      aria-label={t("onboarding.checklist.title")}
      className="flex flex-col gap-3"
    >
      <div className="rounded-xl border bg-background p-4">
        <p className="text-sm font-semibold">{t("onboarding.checklist.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          {progressCopy}
        </p>

        {/* Desktop rail */}
        <ul className="mt-4 hidden flex-col gap-1.5 lg:flex">
          {items.map((item) => {
            const Icon = ITEM_ICONS[item.id];
            const active = currentStep === item.step;
            const label = checklistLabel(t, item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  data-onboarding-checklist-item={item.id}
                  data-done={item.done}
                  aria-current={active ? "step" : undefined}
                  aria-label={
                    item.done
                      ? t("onboarding.checklist.stepDone", { step: label })
                      : t("onboarding.checklist.openStep", { step: label })
                  }
                  onClick={() => onSelectStep(item.step)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : item.done
                        ? "border-transparent bg-muted/40 text-foreground hover:bg-muted"
                        : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {item.done ? (
                    <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
          <li className="mt-1">
            <button
              type="button"
              data-onboarding-checklist-item="summary"
              data-done={finished}
              aria-current={currentStep === 4 ? "step" : undefined}
              onClick={onSelectFinish}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors ${
                currentStep === 4
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-dashed text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <Rocket className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t("onboarding.finishSetup")}</span>
            </button>
          </li>
        </ul>

        {/* Mobile chip strip */}
        <ul className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
          {items.map((item) => {
            const Icon = ITEM_ICONS[item.id];
            const active = currentStep === item.step;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  data-onboarding-checklist-item={item.id}
                  data-done={item.done}
                  aria-label={t("onboarding.checklist.openStep", {
                    step: checklistLabel(t, item.id),
                  })}
                  onClick={() => onSelectStep(item.step)}
                  className={`flex size-9 items-center justify-center rounded-full border transition-colors ${
                    item.done
                      ? "border-success/30 bg-success/10 text-success"
                      : active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {item.done ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Icon className="size-4" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSelectFinish}
              data-onboarding-checklist-item="summary"
            >
              <Rocket className="size-4" aria-hidden="true" />
              {t("onboarding.finishSetup")}
            </Button>
          </li>
        </ul>
      </div>

      <p className="hidden px-1 text-xs leading-5 text-muted-foreground lg:block">
        {t("onboarding.skipHint")}
      </p>
    </aside>
  );
}

function checklistLabel(
  t: (key: string) => string,
  id: OnboardingChecklistItemId,
): string {
  switch (id) {
    case "shop":
      return t("onboarding.shop.title");
    case "whatsapp":
      return t("onboarding.connectWhatsApp");
    case "couriers":
      return t("onboarding.couriers.title");
    case "ai":
      return t("onboarding.steps.ai");
  }
}
