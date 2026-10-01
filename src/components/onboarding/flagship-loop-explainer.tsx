"use client";

import { ArrowRight, Bot, MessageCircle, PackageCheck } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import { IconTile, Panel } from "@/components/system";

/**
 * Flagship-loop explainer (R4-b) — teaches the core SahelFlow loop the old
 * onboarding never showed:
 *
 *   WhatsApp message → AI extracts the order → Confirm & ship
 *
 * Rendered as the closing section of the final screen (variant="full") and
 * as a compact callout on the WhatsApp step once pairing succeeds
 * (variant="compact"). Static icon illustration only — no images, RTL-safe
 * via logical utilities + icon-rtl-flip on the directional arrows.
 */
export function FlagshipLoopExplainer({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const { t } = useI18n();

  const beats = [
    {
      icon: MessageCircle,
      title: t("onboarding.loop.beat1.title"),
      body: t("onboarding.loop.beat1.body"),
    },
    {
      icon: Bot,
      title: t("onboarding.loop.beat2.title"),
      body: t("onboarding.loop.beat2.body"),
    },
    {
      icon: PackageCheck,
      title: t("onboarding.loop.beat3.title"),
      body: t("onboarding.loop.beat3.body"),
    },
  ] as const;

  if (variant === "compact") {
    return (
      <div
        data-onboarding-loop="compact"
        className="rounded-surface border border-success/30 bg-success-subtle p-4"
      >
        <p className="text-body-sm font-medium text-foreground">
          {t("onboarding.loop.title")}
        </p>
        <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {beats.map((beat, index) => {
            const Icon = beat.icon;
            return (
              <li key={beat.title} className="flex items-center gap-2">
                <IconTile icon={Icon} tone="primary" size="xs" />
                <span className="text-caption text-muted-foreground">
                  {beat.title}
                </span>
                {index < beats.length - 1 ? (
                  <ArrowRight
                    className="hidden size-3.5 shrink-0 text-muted-foreground icon-rtl-flip sm:inline-block"
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <Panel data-onboarding-loop="full" className="p-5 sm:p-6">
      <p className="text-title-3 text-foreground">{t("onboarding.loop.title")}</p>
      <p className="mt-1 text-body-sm text-muted-foreground">
        {t("onboarding.loop.subtitle")}
      </p>
      <ol className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-4">
        {beats.map((beat, index) => {
          const Icon = beat.icon;
          const last = index === beats.length - 1;
          return (
            <li
              key={beat.title}
              data-onboarding-loop-beat={index + 1}
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <IconTile icon={Icon} tone={last ? "success" : "primary"} size="md" />
                {!last ? (
                  <span aria-hidden="true" className="hidden flex-1 items-center gap-1 sm:flex">
                    <span className="h-px flex-1 bg-border" />
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground icon-rtl-flip" />
                  </span>
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="numeric-value text-caption font-semibold text-muted-foreground">
                  0{index + 1}
                </p>
                <p className="text-body-sm font-medium text-foreground">{beat.title}</p>
                <p className="text-caption text-muted-foreground">{beat.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
