"use client";

import { Bot, Check, MessageCircle, Rocket, Store, Truck } from "lucide-react";

import { Panel } from "@/components/system";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/**
 * Persistent setup checklist (R4-b) — the Shopify-style personalized setup
 * checklist pattern (worklog d7-a) applied to SahelFlow onboarding.
 *
 * Every item is a button that jumps to its wizard step, so a skipped step is
 * always returnable. Completion markers are DERIVED from real configuration
 * state (not self-reported "next" clicks) — see onboarding-wizard.tsx.
 * Renders as a vertical stepper beside the step on desktop and collapses to a
 * connected marker strip on narrow screens.
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

const FINISH_STEP = 4;

/** Done-of-total ring. Purely presentational; the count is announced as text. */
export function OnboardingProgressRing({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <span className={cn("relative inline-flex shrink-0", className)} aria-hidden="true">
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className={cn(
            "transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none",
            ratio === 1 ? "stroke-success" : "stroke-primary",
          )}
        />
      </svg>
      <span className="numeric-value absolute inset-0 flex items-center justify-center text-caption font-semibold text-foreground">
        {done}/{total}
      </span>
    </span>
  );
}

type MarkerState = "done" | "current" | "todo";

function StepMarker({
  state,
  children,
}: {
  state: MarkerState;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border text-caption font-semibold transition-colors",
        state === "done" && "border-success/40 bg-success-soft text-success",
        state === "current" && "border-primary bg-primary text-primary-foreground",
        state === "todo" && "border-border bg-surface-1 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

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
  const onFinish = currentStep === FINISH_STEP;

  const statusCopy = (state: MarkerState) =>
    state === "done"
      ? t("onboarding.status.done")
      : state === "current"
        ? t("onboarding.status.current")
        : t("onboarding.status.todo");

  const markerState = (item: OnboardingChecklistItem): MarkerState =>
    item.done ? "done" : currentStep === item.step ? "current" : "todo";

  return (
    <aside
      data-onboarding-checklist="true"
      aria-label={t("onboarding.checklist.title")}
      className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6"
    >
      <Panel className="p-5">
        <div className="flex items-center gap-3">
          <OnboardingProgressRing done={doneCount} total={items.length} className="size-11" />
          <div className="min-w-0">
            <p className="text-title-3 text-foreground">{t("onboarding.checklist.title")}</p>
            <p className="text-caption text-muted-foreground" role="status">
              {progressCopy}
            </p>
          </div>
        </div>

        {/* Desktop stepper */}
        <ol className="mt-5 hidden flex-col lg:flex">
          {items.map((item, index) => {
            const Icon = ITEM_ICONS[item.id];
            const active = currentStep === item.step;
            const state = markerState(item);
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
                  className={cn(
                    "group flex w-full gap-3 rounded-surface px-2 pt-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-primary-subtle" : "hover:bg-muted/50",
                  )}
                >
                  <span className="flex flex-col items-center">
                    <StepMarker state={state}>
                      {item.done ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <span className="numeric-value">{index + 1}</span>
                      )}
                    </StepMarker>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1 w-px flex-1",
                        item.done ? "bg-success/40" : "bg-border",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1 pb-4 pt-1">
                    <span className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          "text-body-sm font-medium",
                          active || item.done ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        {label}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-caption",
                        state === "done"
                          ? "text-success"
                          : state === "current"
                            ? "text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {statusCopy(state)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              data-onboarding-checklist-item="summary"
              data-done={finished}
              aria-current={onFinish ? "step" : undefined}
              onClick={onSelectFinish}
              className={cn(
                "flex w-full items-center gap-3 rounded-surface px-2 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                onFinish ? "bg-primary-subtle" : "hover:bg-muted/50",
              )}
            >
              <StepMarker state={onFinish ? "current" : finished ? "done" : "todo"}>
                <Rocket className="size-4" aria-hidden="true" />
              </StepMarker>
              <span
                className={cn(
                  "text-body-sm font-medium",
                  onFinish ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t("onboarding.finishSetup")}
              </span>
            </button>
          </li>
        </ol>

        {/* Narrow-screen marker strip */}
        <ol className="mt-4 flex items-center lg:hidden">
          {items.map((item, index) => {
            const state = markerState(item);
            return (
              <li key={item.id} className="flex flex-1 items-center">
                <button
                  type="button"
                  data-onboarding-checklist-item={item.id}
                  data-done={item.done}
                  aria-current={currentStep === item.step ? "step" : undefined}
                  aria-label={t("onboarding.checklist.openStep", {
                    step: checklistLabel(t, item.id),
                  })}
                  onClick={() => onSelectStep(item.step)}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <StepMarker state={state}>
                    {item.done ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <span className="numeric-value">{index + 1}</span>
                    )}
                  </StepMarker>
                </button>
                <span
                  aria-hidden="true"
                  className={cn("mx-1.5 h-px flex-1", item.done ? "bg-success/40" : "bg-border")}
                />
              </li>
            );
          })}
          <li>
            <button
              type="button"
              data-onboarding-checklist-item="summary"
              data-done={finished}
              aria-current={onFinish ? "step" : undefined}
              aria-label={t("onboarding.finishSetup")}
              onClick={onSelectFinish}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StepMarker state={onFinish ? "current" : finished ? "done" : "todo"}>
                <Rocket className="size-4" aria-hidden="true" />
              </StepMarker>
            </button>
          </li>
        </ol>
      </Panel>

      <p className="hidden px-1 text-caption text-muted-foreground lg:block">
        {t("onboarding.skipHint")}
      </p>
    </aside>
  );
}

export function checklistLabel(
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
