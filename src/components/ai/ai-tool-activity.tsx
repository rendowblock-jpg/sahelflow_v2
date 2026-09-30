"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, Wrench } from "lucide-react";

import { AiToolResultCard } from "@/components/ai/ai-tool-result-card";
import type { AiToolCallView } from "@/components/ai/ai-workspace-types";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import {
  getAiDecisionCopy,
  type AiDecisionLocale,
} from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

/**
 * One assistant turn's tool work as a single step line under the answer:
 * "Worked with 3 tools · Search orders, Low stock…". The answer stays the
 * reading surface; the evidence is one click away. Ledger AI-06 still holds
 * inside: while a tool runs or after one fails the group is open, so an
 * operator never has to hunt for an error.
 */
export function AiToolActivity({
  tools,
  locale,
}: {
  tools: AiToolCallView[];
  locale: AiDecisionLocale;
}) {
  const running = tools.some((tool) => tool.state === "running");
  const failed = tools.some((tool) => tool.state === "failed");
  const [open, setOpen] = useState(false);
  const expanded = open || running || failed;
  const names = Array.from(
    new Set(tools.map((tool) => getAiToolLabel(locale, tool.name))),
  );

  return (
    <div data-ai-tool-activity="true" className="mt-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen((current) => !current)}
        disabled={running || failed}
        className={cn(
          "group/activity inline-flex max-w-full items-center gap-2 rounded-control px-1.5 py-1 text-caption outline-none transition-colors",
          "text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
          failed && "text-destructive hover:text-destructive",
        )}
      >
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        ) : failed ? (
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Wrench className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="shrink-0 font-medium">
          {running
            ? getAiDecisionCopy(locale, "toolActivityRunning")
            : tools.length === 1
              ? getAiDecisionCopy(locale, "toolActivityOne")
              : getAiDecisionCopy(locale, "toolActivity", { count: tools.length })}
        </span>
        <span className="min-w-0 truncate">· {names.join(", ")}</span>
        {!running && !failed ? (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform rtl:-scale-x-100",
              expanded && "rotate-90 rtl:rotate-90",
            )}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-1 space-y-2 border-s-2 border-border ps-3">
          {tools.map((tool) => (
            <AiToolResultCard key={tool.id} tool={tool} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
