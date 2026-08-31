"use client";

import { ArrowRight, Bot, MessageCircle, PackageCheck } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";

/**
 * Flagship-loop explainer (R4-b) — teaches the core SahelFlow loop the old
 * onboarding never showed:
 *
 *   WhatsApp message → AI extracts the order → Confirm & ship
 *
 * Rendered as the hero of the final "You're ready" screen (variant="full")
 * and as a compact callout on the WhatsApp step once pairing succeeds
 * (variant="compact"). Static icon illustration only — no images, RTL-safe
 * via logical utilities + icon-rtl-flip on the directional arrow.
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
        className="rounded-lg border bg-muted/30 p-3"
      >
        <p className="text-xs font-semibold text-foreground">
          {t("onboarding.loop.title")}
        </p>
        <ol className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          {beats.map((beat, index) => {
            const Icon = beat.icon;
            return (
              <li key={beat.title} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="text-xs text-muted-foreground">
                  {beat.title}
                </span>
                {index < beats.length - 1 ? (
                  <ArrowRight
                    className="hidden size-3.5 shrink-0 text-muted-foreground/60 icon-rtl-flip sm:inline-block"
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
    <div
      data-onboarding-loop="full"
      className="rounded-xl border bg-muted/30 p-5"
    >
      <p className="text-sm font-semibold">{t("onboarding.loop.title")}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {t("onboarding.loop.subtitle")}
      </p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {beats.map((beat, index) => {
          const Icon = beat.icon;
          return (
            <li
              key={beat.title}
              data-onboarding-loop-beat={index + 1}
              className="relative flex flex-col gap-2 rounded-lg border bg-background p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {index + 1}/3
                </span>
              </div>
              <p className="text-sm font-medium leading-5">{beat.title}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {beat.body}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
