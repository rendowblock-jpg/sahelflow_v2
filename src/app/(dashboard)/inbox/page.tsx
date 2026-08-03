import { InboxLive } from "@/components/inbox/inbox-live";
import { WhatsAppIngressRecoveryPanel } from "@/components/inbox/whatsapp-ingress-recovery-panel";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.inbox") };
}
export const dynamic = "force-dynamic";

/**
 * Inbox page — database-authoritative WhatsApp messaging with durable ingress
 * recovery. The sidecar is transport and low-latency projection only.
 */
export default function InboxPage() {
  return (
    <div className="space-y-4">
      <WhatsAppIngressRecoveryPanel />
      <InboxLive />
    </div>
  );
}
