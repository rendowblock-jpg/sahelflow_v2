import type { Metadata } from "next";

import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { WhatsAppIngressRecoveryDock } from "@/components/inbox/whatsapp-ingress-recovery-dock";
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

/** Database-authoritative operational inbox with bounded provider recovery. */
export default async function InboxPage() {
  const actorContext = await requireTrustedAction("conversations.read");
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
    <div className="app-content flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {canViewIngress ? (
        <WhatsAppIngressRecoveryDock canRetry={canRetryIngress} />
      ) : null}
      <div className="min-h-0 flex-1">
        <InboxWorkspace />
      </div>
    </div>
  );
}
