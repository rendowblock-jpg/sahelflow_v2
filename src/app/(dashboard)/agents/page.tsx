import type { Metadata } from "next";

import { AiOperationalLaunchpad } from "@/components/ai/ai-operational-launchpad";
import { AiWorkspace } from "@/components/ai/ai-workspace";
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

  return (
    <div className="app-workspace-content flex flex-col">
      <FeatureGate feature="ai_chat">
        <AiOperationalLaunchpad />
        <div className="min-h-0 flex-1">
          <AiWorkspace />
        </div>
      </FeatureGate>
    </div>
  );
}
