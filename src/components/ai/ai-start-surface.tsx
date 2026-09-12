"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { IconTile } from "@/components/system";
import { Button } from "@/components/ui/button";
import type {
  AiCapabilityGroup,
  AiShopBriefing,
  AiWorkspaceError,
} from "@/components/ai/ai-workspace-types";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { getAiToolGroupLabel, getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import { cn } from "@/lib/utils";

/**
 * STR-01 — the Agents start surface. Named workforce on one engine:
 * greeting, four shop-grounded agents, and live capabilities as disclosure.
 *
 * The contract assertions that pinned these strings moved with the code rather
 * than being relaxed — see `ai-operational-launchpad-contract`,
 * `f06-page-completion-contract`, `ai-workspace-contract` and
 * `wave2-ai-composition-contract`, which now read this file.
 */
function errorMessage(
  error: AiWorkspaceError,
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  switch (error.code) {
    case "AI_CONSENT_REQUIRED":
      return workspace.copy("consentMissing");
    case "AI_LICENSE_REQUIRED":
      return workspace.copy("licenseRequired");
    case "AI_RATE_LIMITED":
      return workspace.copy("rateLimited");
    case "AI_INVALID_MESSAGE":
    case "AI_INVALID_REQUEST":
      return workspace.copy("invalidMessage");
    case "AI_SESSION_NOT_FOUND":
      return workspace.copy("sessionMissing");
    case "AI_RESPONSE_NOT_PERSISTED":
      return workspace.copy("responseNotPersisted");
    case "AI_SESSION_LOAD_FAILED":
      return workspace.copy("conversationLoadFailed");
    case "AI_SESSION_CREATE_FAILED":
      return workspace.copy("sessionCreateFailed");
    case "AI_PROVIDER_UNAVAILABLE":
      return workspace.copy("providerDegraded");
    case "AI_PROVIDER_REPORTED":
      // F-09: the server's locale-native verdict IS the banner text — no
      // invented title on top of it. Falls back to the degraded copy only
      // if an older paired server sent an empty message.
      return error.detail && error.detail.trim()
        ? error.detail
        : workspace.copy("providerDegraded");
    case "AI_STREAM_TIMEOUT":
      return workspace.copy("streamTimeout");
    default:
      return workspace.copy("genericError");
  }
}

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

function SetupNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { setup, setupError, refreshSetup, locale } = workspace;
  if (setup?.ready === true) return null;

  if (!setup && !setupError) {
    return (
      <div className="flex items-center gap-2.5 border-b bg-muted/25 px-4 py-2.5 text-xs text-muted-foreground md:px-6">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {getAiDecisionCopy(locale, "setupChecking")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/20 bg-warning-subtle px-4 py-2.5 md:px-6">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {setupError
              ? workspace.copy("setupUnavailable")
              : getAiDecisionCopy(locale, "setupAttention")}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {setupError
              ? workspace.copy("setupUnavailableDescription")
              : !setup?.consentAccepted
                ? workspace.copy("consentMissing")
                : workspace.copy("keyMissing")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {setupError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshSetup()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {workspace.copy("retry")}
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?group=intelligence">
            <Settings2 className="size-4" aria-hidden="true" />
            {workspace.copy("openSettings")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { error, retry } = workspace;
  if (!error) return null;
  const persistenceOnly = error.code === "AI_RESPONSE_NOT_PERSISTED";

  return (
    <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-surface border border-destructive/25 bg-destructive-soft p-3.5 shadow-sm md:mx-6">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{errorMessage(error, workspace)}</p>
          {error.detail && error.code !== "AI_PROVIDER_REPORTED" ? (
            // AI_PROVIDER_REPORTED already renders the server message as the
            // title — repeating it as the sub-line would duplicate the text.
            <p dir="auto" className="mt-1 text-xs leading-5 text-muted-foreground">
              {error.detail}
            </p>
          ) : null}
        </div>
      </div>
      {!persistenceOnly ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => void retry()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {workspace.copy("retry")}
        </Button>
      ) : null}
    </div>
  );
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
    <li className="flex items-center justify-between gap-3 rounded-surface border bg-background/60 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-control",
            ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          )}
        >
          {ready ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          )}
        </span>
        <span className="truncate text-xs font-medium">{label}</span>
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

/**
 * Ledger F-06 — the agents workforce, rendered from capability truth.
 * Groups and availability come from /api/ai/capabilities, which projects the
 * SAME central policy map the registry and proposal runtime enforce — the page
 * can never claim an ability the agent does not have, nor hide one it has.
 */
function AbilityGroupCard({
  group,
  locale,
}: {
  group: AiCapabilityGroup;
  locale: ReturnType<typeof useAiWorkspace>["locale"];
}) {
  const sensitiveCount = group.tools.filter((tool) => tool.executionClass === "sensitive").length;
  return (
    <div
      data-ai-ability-group={group.id}
      className="rounded-surface border border-border/70 bg-gradient-to-b from-card to-card/60 p-4 shadow-[0_1px_2px_oklch(0_0_0/0.04)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold tracking-tight">
          {getAiToolGroupLabel(locale, group.id)}
        </p>
        <p className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-caption font-semibold tabular-nums text-muted-foreground">
          {group.tools.length}
          {sensitiveCount > 0 ? ` · ${sensitiveCount} ✓` : ""}
        </p>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {group.tools.map((tool) => {
          const sensitive = tool.executionClass === "sensitive";
          return (
            <li
              key={tool.name}
              data-ai-ability={tool.name}
              data-ai-ability-class={tool.executionClass}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors",
                sensitive
                  ? "border-warning/30 bg-warning-soft text-warning"
                  : "border-border/60 bg-background text-foreground",
              )}
            >
              {getAiToolLabel(locale, tool.name)}
              {sensitive ? (
                <>
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  <span className="sr-only">
                    {getAiDecisionCopy(locale, "abilityNeedsApproval")}
                  </span>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AbilitiesPanel({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { capabilities, capabilitiesError, loadingCapabilities, locale } =
    workspace;

  return (
    <section data-ai-abilities="true" className="w-full text-start">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">
          {getAiDecisionCopy(locale, "abilitiesTitle")}
        </p>
      </div>
      {loadingCapabilities ? (
        // Structure-matching skeleton (§26.8): the shape of two group cards.
        <div
          data-ai-abilities-skeleton="true"
          aria-hidden="true"
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="rounded-surface border bg-card/60 p-4">
              <span data-ai-skeleton="true" className="block h-3.5 w-20 rounded-full" />
              <span data-ai-skeleton="true" className="mt-3 block h-4 w-3/4 rounded-full" />
              <span data-ai-skeleton="true" className="mt-1.5 block h-4 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
      ) : capabilitiesError || !capabilities ? (
        // Honest unavailability — the stale-marketing sentence is never shown
        // as if it were live truth.
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {getAiDecisionCopy(locale, "abilitiesUnavailable")}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {getAiDecisionCopy(locale, "abilitiesDescription")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {capabilities.groups.map((group) => (
              <AbilityGroupCard key={group.id} group={group} locale={locale} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** F-06: the shop's real numbers, next to the jobs they ground. A count that
 *  could not be measured renders no badge — never a fabricated zero. */
function starterCount(
  id: (typeof STARTERS)[number]["id"],
  briefing: AiShopBriefing | undefined,
): { copyKey: "starterCountPending" | "starterCountToday" | "starterCountLowStock"; count: number } | null {
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

/**
 * Ledger F-06 — the shop-wide approval loop, surfaced where the seller works.
 * Pending sensitive actions exist across ALL sessions; without this strip
 * they were invisible unless the seller already knew to open the review
 * pane. Hidden while the rail owns the surface (wideReview) and while the
 * inbox is loading or failed (honest absence, not a fake "all clear").
 */
function InboxStrip({
  workspace,
  wideReview,
  onOpenReview,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  wideReview: boolean;
  onOpenReview: () => void;
}) {
  const { inbox, inboxLoading, inboxError, locale } = workspace;
  if (wideReview || inboxLoading || inboxError || inbox.length === 0) {
    return null;
  }
  return (
    <div
      data-ai-inbox-strip="true"
      className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-surface border border-primary/30 bg-gradient-to-b from-primary-soft to-primary-subtle px-4 py-3 shadow-[0_1px_2px_oklch(0_0_0/0.05),0_10px_28px_oklch(0_0_0/0.06)] md:mx-6"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {getAiDecisionCopy(locale, "inboxStripCount", { count: inbox.length })}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {getAiDecisionCopy(locale, "inboxStripDescription")}
          </p>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onOpenReview}>
        {getAiDecisionCopy(locale, "inboxStripOpen")}
      </Button>
    </div>
  );
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
    <div data-ai-start-state="true" className="mx-auto flex w-full max-w-2xl flex-col items-stretch py-8 text-start md:py-12">
      <div className="flex items-start gap-3.5">
        <IconTile icon={BrainCircuit} tone="primary" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-caption font-medium text-muted-foreground">
            {workforceGreeting(locale)}
          </p>
          <h2 className="mt-1 text-title-1 font-semibold tracking-tight">
            {getAiDecisionCopy(locale, "startTitle")}
          </h2>
          <p className="mt-2 max-w-xl text-body text-muted-foreground">
            {getAiDecisionCopy(locale, "startDescription")}
          </p>
        </div>
        {pendingCount > 0 ? (
          <p className="hidden shrink-0 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-caption font-bold tabular-nums text-warning sm:block">
            {getAiDecisionCopy(locale, "inboxStripCount", { count: pendingCount })}
          </p>
        ) : null}
      </div>

      {!ready && workspace.setup ? (
        <div className="mt-7 w-full rounded-surface border bg-card/60 p-4 text-start md:p-5">
          <p className="text-sm font-semibold">
            {getAiDecisionCopy(workspace.locale, "setupRequiredTitle")}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {getAiDecisionCopy(workspace.locale, "setupRequiredCapabilities")}
          </p>
          {/* Truthful two-row checklist: the same configuration facts the
              review panel owns (consent + key), never provider health. */}
          <ul className="mt-3 space-y-1.5">
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
                className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-caption text-muted-foreground"
              >
                {getAiDecisionCopy(workspace.locale, chip)}
              </span>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {getAiDecisionCopy(workspace.locale, "setupRequiredPrivacyNote")}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/settings?group=intelligence">
              <Settings2 className="size-4" aria-hidden="true" />
              {workspace.copy("openSettings")}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-8 flex w-full items-baseline justify-between gap-3">
        <p className="text-sm font-semibold tracking-tight">
          {getAiDecisionCopy(locale, "startJobsTitle")}
        </p>
        <p className="shrink-0 text-caption font-medium tabular-nums text-muted-foreground">
          {getAiDecisionCopy(locale, "messagesMeta", { count: STARTERS.length })}
        </p>
      </div>
      <div
        data-ai-workforce="true"
        className="mt-3 grid w-full gap-2 sm:grid-cols-2"
      >
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
                "group/starter flex items-start gap-3 rounded-surface border border-border/70 bg-card/70 p-3.5 text-start transition-colors",
                "hover:border-primary/30 hover:bg-primary-subtle",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary-subtle text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {getAiDecisionCopy(locale, starter.name)}
                  </span>
                  {count ? (
                    <span
                      data-ai-briefing-count={starter.id}
                      className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold tabular-nums text-primary"
                    >
                      {getAiDecisionCopy(locale, count.copyKey, {
                        count: count.count,
                      })}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-caption leading-5 text-muted-foreground">
                  {workspace.copy(starter.description)}
                </span>
              </span>
              <ArrowRight
                className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/starter:opacity-80 rtl:-scale-x-100"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <details className="group/abilities mt-8 border-t border-border/60 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {getAiDecisionCopy(locale, "abilitiesDisclosure")}
          <ArrowRight className="size-3.5 shrink-0 transition-transform group-open/abilities:rotate-90 rtl:-scale-x-100 rtl:group-open/abilities:-rotate-90" />
        </summary>
        <div className="mt-3">
          <AbilitiesPanel workspace={workspace} />
        </div>
      </details>
    </div>
  );
}


export { ErrorNotice, InboxStrip, STARTERS, SetupNotice, StartSurface };
