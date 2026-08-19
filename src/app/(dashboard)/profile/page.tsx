import type { Metadata } from "next";

import SettingsPage from "@/app/(dashboard)/settings/page";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("profile.title") };
}
export const dynamic = "force-dynamic";

/**
 * Compatibility alias for bookmarks and historical deep links.
 *
 * Profile has one implementation only: the Account/Profile area inside the
 * Settings control center. Keeping this URL as an alias avoids breaking durable
 * links and route-evidence contracts without restoring a separate Profile page
 * or fixed sidebar destination.
 */
export default async function ProfilePage() {
  return SettingsPage({
    searchParams: Promise.resolve({ group: "workspace" }),
  });
}
