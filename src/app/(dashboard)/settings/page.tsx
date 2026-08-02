import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.metaTitle") };
}

export default async function SettingsPage() {
  const actorContext = await requireTrustedAction("settings.read");
  assertTrustedAction(actorContext, "integrations.read");
  const { t } = await getI18n();

  // Fetch integration statuses
  const integrations = await db.integration.findMany({
    orderBy: { platform: "asc" },
  });


  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.settings")}
        description={t("settings.subtitle") }
      />

      <SettingsTabs integrations={integrations.map((i) => ({ platform: i.platform, status: i.isActive ? "active" : "inactive" }))} />
    </div>
  );
}
