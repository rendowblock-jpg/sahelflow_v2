"use client";

import { ShieldCheck } from "lucide-react";

import type { AiCapabilityGroup } from "@/components/ai/ai-workspace-types";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { getAiToolGroupLabel, getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import { cn } from "@/lib/utils";

/**
 * Ledger F-06 — the agent's abilities, rendered from capability truth. Groups
 * and availability come from /api/ai/capabilities, which projects the SAME
 * central policy map the registry and proposal runtime enforce: the page can
 * never claim an ability the agent does not have, nor hide one it has.
 */
function AbilityGroupCard({
  group,
  locale,
}: {
  group: AiCapabilityGroup;
  locale: ReturnType<typeof useAiWorkspace>["locale"];
}) {
  const sensitiveCount = group.tools.filter(
    (tool) => tool.executionClass === "sensitive",
  ).length;
  return (
    <div
      data-ai-ability-group={group.id}
      className="rounded-surface border border-border bg-card p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm font-semibold">
          {getAiToolGroupLabel(locale, group.id)}
        </p>
        <p className="shrink-0 text-caption tabular-nums text-muted-foreground">
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
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium",
                sensitive
                  ? "bg-warning-soft text-warning"
                  : "bg-muted text-foreground",
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

export function AbilitiesPanel({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { capabilities, capabilitiesError, loadingCapabilities, locale } = workspace;

  return (
    <section data-ai-abilities="true" className="w-full text-start">
      {loadingCapabilities ? (
        // Structure-matching skeleton (§26.8): the shape of the group cards.
        <div
          data-ai-abilities-skeleton="true"
          aria-hidden="true"
          className="grid gap-3 sm:grid-cols-2"
        >
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="rounded-surface border border-border bg-card p-3.5">
              <span data-ai-skeleton="true" className="block h-3.5 w-20 rounded-full" />
              <span data-ai-skeleton="true" className="mt-3 block h-4 w-3/4 rounded-full" />
            </div>
          ))}
        </div>
      ) : capabilitiesError || !capabilities ? (
        // Honest unavailability — a stale marketing sentence is never shown
        // as if it were live truth.
        <p className="text-caption text-muted-foreground">
          {getAiDecisionCopy(locale, "abilitiesUnavailable")}
        </p>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {getAiDecisionCopy(locale, "abilitiesDescription")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {capabilities.groups.map((group) => (
              <AbilityGroupCard key={group.id} group={group} locale={locale} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
