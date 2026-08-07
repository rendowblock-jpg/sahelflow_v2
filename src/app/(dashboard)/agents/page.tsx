import type { Metadata } from "next";

import { AiChat } from "@/components/ai/ai-chat";
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
    <div className="app-content page-sections">
      <PageHeader title={t("metadata.title.agents")} />
      <FeatureGate feature="ai_chat">
        <AiChat />
      </FeatureGate>
    </div>
  );
}
