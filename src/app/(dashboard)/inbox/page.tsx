import type { Metadata } from "next";

import { InboxLive } from "@/components/inbox/inbox-live";
import { WhatsAppIngressRecoveryPanel } from "@/components/inbox/whatsapp-ingress-recovery-panel";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.inbox") };
}
export const dynamic = "force-dynamic";

/** Database-authoritative inbox with durable provider recovery. */
export default async function InboxPage() {
  const actorContext = await requireTrustedAction("conversations.read");
  const { t } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const canViewIngress = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    resource,
  );
  const canRetryIngress =
    canViewIngress &&
    trustedActionAllowed(actorContext, "conversations.update", resource);

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.inbox")} description={t("inbox.subtitle")} />
      {canViewIngress ? (
        <WhatsAppIngressRecoveryPanel canRetry={canRetryIngress} />
      ) : null}
      <InboxLive />
    </div>
  );
}
