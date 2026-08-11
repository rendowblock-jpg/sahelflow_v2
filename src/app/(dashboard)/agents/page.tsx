import type { Metadata } from "next";

import { AiWorkspace } from "@/components/ai/ai-workspace";
import { FeatureGate } from "@/components/license/feature-gate";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.agents") };
}
export const dynamic = "force-dynamic";

/** Durable AI workspace with proposal-bound sensitive actions. */
export default async function AgentsPage() {
  await requireTrustedAction("ai.use");
  const { t } = await getI18n();

  return (
    <div className="app-content flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <PageHeader title={t("metadata.title.agents")} />
      <FeatureGate feature="ai_chat">
        <div className="min-h-0 flex-1">
          <AiWorkspace />
        </div>
      </FeatureGate>
    </div>
  );
}
