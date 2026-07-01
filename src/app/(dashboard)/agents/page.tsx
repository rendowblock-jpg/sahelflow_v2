import { FeatureGate } from "@/components/license/feature-gate";
import { AiChat } from "@/components/ai/ai-chat";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.agents") };
}
export const dynamic = "force-dynamic";

/**
 * Agents page — now hosts the live AI chat (session-based, 6 tools).
 * The chat uses Gemini (loaded from the Secret store) + an agentic loop that
 * can call tools to search products/customers, create orders, get stats, etc.
 */
export default function AgentsPage() {
  return <FeatureGate feature="ai_chat">
      <AiChat />
    </FeatureGate>;
}
