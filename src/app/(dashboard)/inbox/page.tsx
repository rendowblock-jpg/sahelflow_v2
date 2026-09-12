import type { Metadata } from "next";

import { InboxV3Workspace } from "@/components/inbox/inbox-v3-workspace";
import { getI18n } from "@/lib/i18n-server";
import { PageShell } from "@/components/system";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.inbox") };
}
export const dynamic = "force-dynamic";

/** Database-authoritative Class-AAA operational Inbox. */
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
    // Workspace identity lives in InboxV3Header. A second visible PageHeader
    // (Internal.37) stacked two titles above the chat list and stole height
    // from the queue. The shell still owns `app-workspace-content` on the
    // route root for the `#main-content:has(> …)` rule; the <h1> stays for
    // assistive tech without consuming pane pixels.
    <PageShell
      variant="workspace"
      identity="sr-only"
      title={t("metadata.title.inbox")}
    >
      <InboxV3Workspace
        canViewIngress={canViewIngress}
        canRetryIngress={canRetryIngress}
      />
    </PageShell>
  );
}
