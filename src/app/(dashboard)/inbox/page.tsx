import { InboxLive } from "@/components/inbox/inbox-live";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Messagerie — SahelFlow" };
export const dynamic = "force-dynamic";

/**
 * Inbox page — live WhatsApp messaging via the Baileys sidecar, with a
 * graceful fallback to seeded demo conversations when the sidecar is not
 * running or not connected. All interactivity lives in <InboxLive />.
 */
export default function InboxPage() {
  return <InboxLive />;
}
