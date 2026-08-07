import type { Metadata } from "next";

import { InboxLive } from "@/components/inbox/inbox-live";
import { WhatsAppIngressRecoveryPanel } from "@/components/inbox/whatsapp-ingress-recovery-panel";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getI18n(); return { title: t("metadata.title.inbox") }; }

export default async function InboxPage() {
  const actorContext = await requireTrustedAction("conversations.read");
  const resource = { shopId: actorContext.shop.shopId };
  const canReadRecovery = trustedActionAllowed(actorContext, "customers.contact.read", resource);
  const canRecover = canReadRecovery && trustedActionAllowed(actorContext, "conversations.update", resource);
  const { t } = await getI18n();
  return <div className="app-content page-sections"><PageHeader title={t("nav.inbox")} description={t("inbox.subtitle")} />{canReadRecovery ? <WhatsAppIngressRecoveryPanel canRecover={canRecover} /> : null}<InboxLive /></div>;
}
