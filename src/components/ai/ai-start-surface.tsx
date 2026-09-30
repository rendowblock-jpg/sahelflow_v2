"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { AbilitiesPanel } from "@/components/ai/ai-abilities-panel";
import type { AiQuickJob } from "@/components/ai/ai-quick-jobs";
import { SahelFlowMark } from "@/components/brand/sahelflow-mark";
import { Button } from "@/components/ui/button";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

function workforceGreeting(
  locale: ReturnType<typeof useAiWorkspace>["locale"],
): string {
  const hour = new Date().getHours();
  if (hour < 12) return getAiDecisionCopy(locale, "greetingMorning");
  if (hour < 18) return getAiDecisionCopy(locale, "greetingAfternoon");
  return getAiDecisionCopy(locale, "greetingEvening");
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium",
        done ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {done ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

/**
 * AI-25 — what the agent does and how to turn it on, stated once and
 * compactly while the agent cannot run yet. The facts come from the setup
 * probe (consent + key), never a fabricated provider heartbeat, and it only
 * renders once setup has resolved (the checking line owns the loading state).
 */
function SetupPanel({ workspace }: { workspace: ReturnType<typeof useAiWorkspace> }) {
  const setup = workspace.setup!;
  return (
    <section
      data-ai-setup-panel="true"
      className="rounded-surface border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-warning-soft text-warning">
          <CircleAlert className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold">
            {getAiDecisionCopy(workspace.locale, "setupBannerTitle")}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {getAiDecisionCopy(
              workspace.locale,
              setup.consentAccepted ? "setupBannerKey" : "setupBannerConsent",
            )}
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/settings?group=intelligence">
            {getAiDecisionCopy(workspace.locale, "setupBannerAction")}
          </Link>
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 ps-12">
        <SetupStep done={setup.consentAccepted === true} label={workspace.copy("consent")} />
        <SetupStep done={setup.keyConfigured === true} label={workspace.copy("gemini")} />
      </div>
      <details className="group/what mt-3 border-t border-border pt-3 ps-12">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-caption font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {getAiDecisionCopy(workspace.locale, "setupRequiredTitle")}
          <ChevronDown className="size-3.5 transition-transform group-open/what:rotate-180" aria-hidden="true" />
        </summary>
        <p className="mt-2 text-caption text-muted-foreground">
          {getAiDecisionCopy(workspace.locale, "setupRequiredCapabilities")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              "setupChipPendingOrders",
              "setupChipBestProducts",
              "setupChipRevenueToday",
              "setupChipTopWilayas",
            ] as const
          ).map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-border px-2.5 py-0.5 text-caption text-muted-foreground"
            >
              {getAiDecisionCopy(workspace.locale, chip)}
            </span>
          ))}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-caption text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {getAiDecisionCopy(workspace.locale, "setupRequiredPrivacyNote")}
        </p>
      </details>
    </section>
  );
}

/**
 * The new-chat home: the agent, one question, the composer as the page's
 * main control, the shop's live numbers as one-tap questions, and the four
 * seller jobs the agent is built for. Everything that is not the next action
 * (abilities, setup detail) sits behind a disclosure.
 */
function StartSurface({
  workspace,
  starting,
  quickJobs,
  composer,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  starting: boolean;
  quickJobs: AiQuickJob[];
  /** The hero composer, owned by the canvas (one draft truth). */
  composer: ReactNode;
  onStart: (prompt: string) => Promise<boolean>;
}) {
  const ready = workspace.setup?.ready === true;
  const locale = workspace.locale;
  const STARTERS = quickJobs.filter((job) => job.id !== "deliveries");
  const briefing = workspace.capabilities?.briefing;
  const pendingApprovals =
    briefing?.pendingProposals ?? (workspace.inboxError ? null : workspace.inbox.length);
  const pulse = [
    { id: "pending", label: "briefingPendingOrders", value: briefing?.pendingOrders, prompt: "briefingPendingPrompt" },
    { id: "today", label: "briefingOrdersToday", value: briefing?.ordersToday, prompt: "briefingTodayPrompt" },
    { id: "stock", label: "briefingLowStock", value: briefing?.lowStockProducts, prompt: "briefingLowStockPrompt" },
    { id: "deliveries", label: "briefingDeliveries", value: briefing?.pendingDeliveries, prompt: "briefingDeliveriesPrompt" },
  ] as const;
  const measured = pulse.filter(
    (entry): entry is (typeof pulse)[number] & { value: number } =>
      typeof entry.value === "number",
  );

  return (
    <div
      data-ai-start-state="true"
      className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-10 pt-10 md:px-6 md:pt-20"
    >
      <div className="flex flex-col items-center text-center">
        <SahelFlowMark className="size-11" />
        <p className="mt-5 text-body-sm font-medium text-muted-foreground">
          {workforceGreeting(locale)}
        </p>
        <h2 className="mt-1 text-balance text-display">
          {getAiDecisionCopy(locale, "homeTitle")}
        </h2>
        <p className="mt-2 max-w-md text-balance text-body-sm text-muted-foreground">
          {getAiDecisionCopy(locale, "homeSubtitle")}
        </p>
      </div>

      {!workspace.setup && !workspace.setupError ? (
        <p className="mt-6 flex items-center justify-center gap-2 text-caption text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {getAiDecisionCopy(locale, "setupChecking")}
        </p>
      ) : null}
      {workspace.setupError ? (
        <p className="mt-6 text-center text-caption text-muted-foreground">
          {workspace.copy("setupUnavailable")}
        </p>
      ) : null}
      {!ready && workspace.setup ? (
        <div className="mt-6">
          <SetupPanel workspace={workspace} />
        </div>
      ) : null}

      <div className="mt-6">{composer}</div>

      {ready && (measured.length > 0 || (pendingApprovals ?? 0) > 0) ? (
        <section aria-label={getAiDecisionCopy(locale, "briefingTitle")} className="mt-6">
          <p className="px-1 text-caption font-medium text-muted-foreground">
            {getAiDecisionCopy(locale, "briefingTitle")}
          </p>
          <div data-ai-briefing="true" className="mt-2 flex flex-wrap gap-2">
            {measured.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-ai-briefing-count={entry.id}
                disabled={starting}
                onClick={() => void onStart(getAiDecisionCopy(locale, entry.prompt))}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-body-sm outline-none transition-colors hover:border-ring/50 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="font-semibold tabular-nums">{entry.value}</span>
                <span className="text-muted-foreground">
                  {getAiDecisionCopy(locale, entry.label)}
                </span>
              </button>
            ))}
            {(pendingApprovals ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-body-sm text-warning">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                <span className="font-semibold tabular-nums">{pendingApprovals}</span>
                {getAiDecisionCopy(locale, "briefingApprovals")}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <div data-ai-workforce="true" className="mt-6 grid gap-2 sm:grid-cols-2">
        {STARTERS.map((starter) => {
          const Icon = starter.icon;
          return (
            <button
              key={starter.id}
              type="button"
              disabled={!ready || starting}
              onClick={() => void onStart(starter.prompt)}
              className={cn(
                "group/starter flex items-start gap-3 rounded-surface border border-border bg-card/60 p-3.5 text-start transition-colors",
                "hover:border-ring/40 hover:bg-card",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover/starter:text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium">{starter.title}</span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {starter.description}
                </span>
              </span>
              <ArrowUpRight
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/starter:opacity-100 rtl:-scale-x-100"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <details className="group/abilities mt-6 w-full">
        <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-control px-1 text-body-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {getAiDecisionCopy(locale, "abilitiesLink")}
          <ChevronDown
            className="size-3.5 shrink-0 transition-transform group-open/abilities:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-3 text-start">
          <AbilitiesPanel workspace={workspace} />
        </div>
      </details>
    </div>
  );
}

export { StartSurface };
