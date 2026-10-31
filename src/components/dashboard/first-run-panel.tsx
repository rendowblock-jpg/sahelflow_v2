"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";

import {
  FIRST_RUN_HREFS,
  resolveFirstRun,
  trialDaysLeft,
  type FirstRunCounts,
  type FirstRunStepId,
} from "@/components/dashboard/first-run-state";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { useLicenseStore } from "@/stores/license-store";

interface FirstRunPanelProps {
  counts: FirstRunCounts;
  /** True once the shop has set its delivery prices (not derived from counts). */
  deliveryPricesSet?: boolean;
  /** Test seam for the trial line; defaults to the current time. */
  now?: number;
}

interface StepLink {
  href: string;
  labelKey: string;
}

const STEP_COPY: Record<
  FirstRunStepId,
  { titleKey: string; hintKey: string; links: readonly StepLink[] }
> = {
  product: {
    titleKey: "dashboard.firstRun.product.title",
    hintKey: "dashboard.firstRun.product.hint",
    links: [
      { href: FIRST_RUN_HREFS.product, labelKey: "dashboard.firstRun.product.cta" },
    ],
  },
  order: {
    titleKey: "dashboard.firstRun.order.title",
    hintKey: "dashboard.firstRun.order.hint",
    links: [
      { href: FIRST_RUN_HREFS.whatsapp, labelKey: "dashboard.firstRun.order.whatsappCta" },
      { href: FIRST_RUN_HREFS.order, labelKey: "dashboard.firstRun.order.manualCta" },
    ],
  },
  delivery: {
    titleKey: "dashboard.firstRun.delivery.title",
    hintKey: "dashboard.firstRun.delivery.hint",
    links: [
      { href: FIRST_RUN_HREFS.delivery, labelKey: "dashboard.firstRun.delivery.cta" },
    ],
  },
};

/**
 * What a brand-new seller sees instead of empty charts: three steps with real
 * links, ticks from the real counts, and (when the licence is a running trial
 * on this device) one calm line about the days left.
 */
export function FirstRunPanel({ counts, deliveryPricesSet, now }: FirstRunPanelProps) {
  const { t } = useI18n();
  const projection = useLicenseStore((state) => state.projection);
  // Read the clock once per mount: render stays pure and the line does not flicker.
  const [mountedAt] = useState(() => now ?? Date.now());
  const run = resolveFirstRun(counts, { deliveryPricesSet });
  if (!run.show) return null;

  const days = trialDaysLeft(projection, mountedAt);
  const firstOpen = run.steps.findIndex((step) => !step.done);

  return (
    <section
      data-testid="dashboard-first-run"
      aria-labelledby="dashboard-first-run-title"
      className="rounded-surface border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2
            id="dashboard-first-run-title"
            className="text-lg font-semibold text-foreground"
          >
            {t("dashboard.firstRun.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.firstRun.subtitle")}
          </p>
        </div>
        <p
          data-testid="dashboard-first-run-progress"
          className="text-xs font-medium tabular-nums text-muted-foreground"
        >
          {t("dashboard.firstRun.progress", {
            done: run.doneCount,
            total: run.total,
          })}
        </p>
      </div>

      <ol className="mt-5 divide-y divide-border/70 rounded-control border border-border/70">
        {run.steps.map((step, index) => {
          const copy = STEP_COPY[step.id];
          return (
            <li
              key={step.id}
              data-step={step.id}
              data-done={step.done ? "true" : "false"}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                  step.done
                    ? "border-success/25 bg-success-soft text-success-ink"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {step.done ? <Check className="size-4" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium text-foreground">
                  {t(copy.titleKey)}
                  <span className="sr-only">
                    {" "}
                    {step.done
                      ? t("dashboard.firstRun.done")
                      : t("dashboard.firstRun.todo")}
                  </span>
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(copy.hintKey)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {copy.links.map((link, linkIndex) => (
                  <Button
                    key={link.href}
                    asChild
                    size="sm"
                    variant={
                      index === firstOpen && linkIndex === 0 ? "default" : "outline"
                    }
                  >
                    <Link href={link.href}>{t(link.labelKey)}</Link>
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {days !== null ? (
        <p
          data-testid="dashboard-first-run-trial"
          className="mt-4 text-xs text-muted-foreground"
        >
          {t("dashboard.firstRun.trial", { days })}
        </p>
      ) : null}
    </section>
  );
}
