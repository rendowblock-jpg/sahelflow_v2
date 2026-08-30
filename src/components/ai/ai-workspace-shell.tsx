"use client";

import { AiDecisionWorkspace } from "@/components/ai/ai-decision-workspace";

/**
 * AI page composition boundary.
 *
 * The Founder-approved Class-AAA direction is a seller decision workspace:
 * durable work history at logical start, a dominant decision canvas, and
 * progressive review/evidence. The protected AI engine remains owned by the
 * existing workspace hook and server APIs.
 */
export function AiWorkspaceShell({
  initialPrompt = "",
}: {
  /** Composer prefill from a /agents?q= deep link (record-surface "Ask AI"). */
  initialPrompt?: string;
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <AiDecisionWorkspace initialPrompt={initialPrompt} />
    </div>
  );
}
