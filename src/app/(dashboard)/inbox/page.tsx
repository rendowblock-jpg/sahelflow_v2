import { InboxLive } from "@/components/inbox/inbox-live";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.inbox") };
}
export const dynamic = "force-dynamic";

/**
 * Inbox page — live WhatsApp messaging via the Baileys sidecar, with a
 * graceful fallback to seeded demo conversations when the sidecar is not
 * running or not connected. All interactivity lives in <InboxLive />.
 */
export default function InboxPage() {
  return <InboxLive />;
}
