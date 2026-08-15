import type { Metadata } from "next";

import { AiWorkspaceShell } from "@/components/ai/ai-workspace-shell";
import { FeatureGate } from "@/components/license/feature-gate";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.agents") };
}
export const dynamic = "force-dynamic";

/** Durable, task-oriented AI workspace with proposal-bound sensitive actions. */
export default async function AgentsPage() {
  await requireTrustedAction("ai.use");
  const { t } = await getI18n();

  return (
    <div className="app-workspace-content">
      <h1 className="sr-only">{t("metadata.title.agents")}</h1>
      <FeatureGate feature="ai_chat">
        <AiWorkspaceShell />
      </FeatureGate>
    </div>
  );
}
