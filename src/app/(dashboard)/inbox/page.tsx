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
    // IA-01: Inbox was the second route opted out of the page grammar, with its
    // only <h1> hidden by `sr-only`. PageShell's `workspace` variant keeps the
    // full-height geometry it needs — `app-workspace-content` still sits on the
    // route root for the `#main-content:has(> …)` rule, and the body stays
    // `min-h-0 flex-1 overflow-hidden` so the panes own the remaining space —
    // while the screen finally states its own name.
    <PageShell variant="workspace" title={t("metadata.title.inbox")}>
      <InboxV3Workspace
        canViewIngress={canViewIngress}
        canRetryIngress={canRetryIngress}
      />
    </PageShell>
  );
}
