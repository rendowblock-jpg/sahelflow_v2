"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  PackageSearch,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AbilitiesPanel } from "@/components/ai/ai-abilities-panel";
import { Button } from "@/components/ui/button";
import type { AiShopBriefing } from "@/components/ai/ai-workspace-types";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

/**
 * STR-01 — the Agents start surface: one calm hero (greeting, the question,
 * the approval promise), four shop-grounded jobs with live counts, the setup
 * checklist when the agent cannot run yet, and the live abilities behind a
 * disclosure. Notices live in `ai-canvas-notices.tsx`, abilities in
 * `ai-abilities-panel.tsx`; the contract tests read all three.
 */
const STARTERS = [
  {
    id: "pending",
    name: "agentOrders",
    title: "launchPendingTitle",
    description: "launchPendingDescription",
    prompt: "launchPendingPrompt",
    icon: ClipboardCheck,
  },
  {
    id: "revenue",
    name: "agentInsights",
    title: "launchRevenueTitle",
    description: "launchRevenueDescription",
    prompt: "launchRevenuePrompt",
    icon: CircleDollarSign,
  },
  {
    id: "returns",
    name: "agentReturns",
    title: "launchReturnsTitle",
    description: "launchReturnsDescription",
    prompt: "launchReturnsPrompt",
    icon: RotateCcw,
  },
  {
    id: "products",
    name: "agentCatalog",
    title: "launchProductsTitle",
    description: "launchProductsDescription",
    prompt: "launchProductsPrompt",
    icon: PackageSearch,
  },
] as const;

function workforceGreeting(
  locale: ReturnType<typeof useAiWorkspace>["locale"],
): string {
  const hour = new Date().getHours();
  if (hour < 12) return getAiDecisionCopy(locale, "greetingMorning");
  if (hour < 18) return getAiDecisionCopy(locale, "greetingAfternoon");
  return getAiDecisionCopy(locale, "greetingEvening");
}

function SetupChecklistRow({
  ready,
  label,
  readyLabel,
  missingLabel,
}: {
  ready: boolean;
  label: string;
  readyLabel: string;
  missingLabel: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full",
            ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          )}
        >
          {ready ? (
            <Check className="size-3" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3" aria-hidden="true" />
          )}
        </span>
        <span className="truncate text-body-sm">{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-caption font-semibold",
          ready ? "text-success" : "text-warning",
        )}
      >
        {ready ? readyLabel : missingLabel}
      </span>
    </li>
  );
}

/** F-06: the shop's real numbers, next to the jobs they ground. A count that
 *  could not be measured renders no badge — never a fabricated zero. */
function starterCount(
  id: (typeof STARTERS)[number]["id"],
  briefing: AiShopBriefing | undefined,
): {
  copyKey: "starterCountPending" | "starterCountToday" | "starterCountLowStock";
  count: number;
} | null {
  if (!briefing) return null;
  if (id === "pending" && briefing.pendingOrders != null) {
    return { copyKey: "starterCountPending", count: briefing.pendingOrders };
  }
  if (id === "revenue" && briefing.ordersToday != null) {
    return { copyKey: "starterCountToday", count: briefing.ordersToday };
  }
  if (id === "products" && briefing.lowStockProducts != null) {
    return { copyKey: "starterCountLowStock", count: briefing.lowStockProducts };
  }
  return null;
}

function StartSurface({
  workspace,
  starting,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  starting: boolean;
  onStart: (prompt: string) => Promise<boolean>;
}) {
  const ready = workspace.setup?.ready === true;
  const locale = workspace.locale;
  const pendingCount =
    workspace.capabilities?.briefing?.pendingProposals ?? workspace.inbox.length ?? 0;

  return (
    <div
      data-ai-start-state="true"
      className="flex w-full flex-col items-stretch py-6 md:py-10"
    >
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-surface bg-primary-soft text-primary"
        >
          <Sparkles className="size-6" />
        </span>
        <p className="mt-4 text-body-sm font-medium text-muted-foreground">
          {workforceGreeting(locale)}
        </p>
        <h2 className="mt-1 text-title-1">
          {getAiDecisionCopy(locale, "startTitle")}
        </h2>
        <p className="mt-2 max-w-lg text-body text-muted-foreground">
          {getAiDecisionCopy(locale, "startDescription")}
        </p>
        {pendingCount > 0 ? (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-caption font-semibold tabular-nums text-warning">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {getAiDecisionCopy(locale, "inboxStripCount", { count: pendingCount })}
          </p>
        ) : null}
      </div>

      {!ready && workspace.setup ? (
        <div className="mt-8 rounded-surface border border-border bg-card p-4 md:p-5">
          <p className="text-title-3">
            {getAiDecisionCopy(workspace.locale, "setupRequiredTitle")}
          </p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {getAiDecisionCopy(workspace.locale, "setupRequiredCapabilities")}
          </p>
          {/* Truthful two-row checklist: the same configuration facts the
              review panel owns (consent + key), never provider health. */}
          <ul className="mt-3 divide-y divide-border border-y border-border">
            <SetupChecklistRow
              ready={workspace.setup.consentAccepted === true}
              label={workspace.copy("consent")}
              readyLabel={workspace.copy("accepted")}
              missingLabel={workspace.copy("missing")}
            />
            <SetupChecklistRow
              ready={workspace.setup.keyConfigured === true}
              label={workspace.copy("gemini")}
              readyLabel={workspace.copy("configured")}
              missingLabel={workspace.copy("notConfigured")}
            />
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
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
                className="rounded-full bg-muted px-2.5 py-0.5 text-caption text-muted-foreground"
              >
                {getAiDecisionCopy(workspace.locale, chip)}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 items-start gap-1.5 text-caption text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {getAiDecisionCopy(workspace.locale, "setupRequiredPrivacyNote")}
            </p>
            <Button asChild size="sm">
              <Link href="/settings?group=intelligence">
                <Settings2 className="size-4" aria-hidden="true" />
                {workspace.copy("openSettings")}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <p className="mt-8 px-1 text-caption font-medium text-muted-foreground">
        {getAiDecisionCopy(locale, "startSuggestionsTitle")}
      </p>
      <div data-ai-workforce="true" className="mt-2 grid w-full gap-2 sm:grid-cols-2">
        {STARTERS.map((starter) => {
          const Icon = starter.icon;
          const count = starterCount(starter.id, workspace.capabilities?.briefing);
          return (
            <button
              key={starter.id}
              type="button"
              disabled={!ready || starting}
              onClick={() => void onStart(workspace.copy(starter.prompt))}
              className={cn(
                "group/starter flex items-start gap-3 rounded-surface border border-border bg-card p-3.5 text-start transition-colors",
                "hover:border-primary/35 hover:bg-primary-subtle",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-muted text-foreground transition-colors group-hover/starter:bg-primary-soft group-hover/starter:text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-semibold">
                    {getAiDecisionCopy(locale, starter.name)}
                  </span>
                  {count ? (
                    <span
                      data-ai-briefing-count={starter.id}
                      className="shrink-0 rounded-full bg-primary-soft px-2 text-caption font-semibold tabular-nums text-primary"
                    >
                      {getAiDecisionCopy(locale, count.copyKey, { count: count.count })}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {workspace.copy(starter.description)}
                </span>
              </span>
              <ArrowUpRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/starter:opacity-100 rtl:-scale-x-100"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <details className="group/abilities mt-6">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-control px-1 text-body-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {getAiDecisionCopy(locale, "abilitiesDisclosure")}
          <ChevronDown
            className="size-3.5 shrink-0 transition-transform group-open/abilities:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-3">
          <AbilitiesPanel workspace={workspace} />
        </div>
      </details>
    </div>
  );
}

export { STARTERS, StartSurface };
