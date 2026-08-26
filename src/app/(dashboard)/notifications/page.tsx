import type { Metadata } from "next";

import { NotificationCenterWorkspace } from "@/components/notifications/notification-center-workspace";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("notifications.title") };
}

export default async function NotificationsPage() {
  await requireTrustedAction("conversations.read");
  return <NotificationCenterWorkspace />;
}
