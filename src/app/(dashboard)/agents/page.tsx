import type { Metadata } from "next";

import { AiWorkspaceShell } from "@/components/ai/ai-workspace-shell";
import { sanitizeAskAiPrompt } from "@/lib/ai/ask-ai-link";
import { FeatureGate } from "@/components/license/feature-gate";
import { getI18n } from "@/lib/i18n-server";
import { PageShell } from "@/components/system";
import { requireTrustedAction } from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.agents") };
}
export const dynamic = "force-dynamic";

/** Durable, task-oriented AI workspace with proposal-bound sensitive actions. */
export default async function AgentsPage({
  searchParams,
}: {
  /**
   * `?q=` prefills the composer with a contextual prompt (record-surface
   * "Ask AI" buttons). The payload is sanitized to a short sentence —
   * record identifiers only, never customer PII.
   */
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requireTrustedAction("ai.use");
  const { t } = await getI18n();
  const params = await searchParams;
  const initialPrompt = sanitizeAskAiPrompt(params?.q);

  return (
    // Workspace identity lives in the canvas / history headers. Internal.37's
    // visible PageHeader stacked a second title above the Agents workspace
    // and is rejected. Geometry still belongs to PageShell so
    // `app-workspace-content` stays on the route root.
    <PageShell
      variant="workspace"
      identity="sr-only"
      title={t("metadata.title.agents")}
    >
      <FeatureGate feature="ai_chat">
        <AiWorkspaceShell initialPrompt={initialPrompt} />
      </FeatureGate>
    </PageShell>
  );
}
