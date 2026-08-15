import type { Metadata } from "next";

import { InboxDesktopPrimer } from "@/components/inbox/inbox-desktop-primer";
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
    <div className="app-workspace-content flex flex-col">
      <h1 className="sr-only">{t("metadata.title.inbox")}</h1>
      <InboxDesktopPrimer />
      {canViewIngress ? (
        <div className="shrink-0 px-2 pt-2">
          <WhatsAppIngressRecoveryDock canRetry={canRetryIngress} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <InboxWorkspace />
      </div>
    </div>
  );
}
