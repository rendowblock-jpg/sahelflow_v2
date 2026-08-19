import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("profile.title") };
}
export const dynamic = "force-dynamic";

/**
 * Compatibility route for bookmarks, command results and historical deep links.
 * Profile is now canonically owned by Settings, so this route never maintains a
 * second copy of the account experience.
 */
export default async function ProfilePage() {
  await requireTrustedAction("settings.read");
  redirect("/settings?group=workspace#settings-profile");
}
