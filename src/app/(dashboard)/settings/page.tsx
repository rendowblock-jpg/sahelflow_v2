import type { Metadata } from "next";

import { SettingsTabs, type SettingsSurfaceAccess } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getI18n(); return { title: t("settings.metaTitle") }; }

export default async function SettingsPage() {
  const actorContext = await requireTrustedAction("settings.read");
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) => trustedActionAllowed(actorContext, action, resource);
  const access: SettingsSurfaceAccess = {
    settingsManage: can("settings.manage"),
    sessionsManage: can("sessions.revoke") && can("devices.manage"),
    membersManage: can("members.manage"),
    licenseManage: can("license.manage"),
    integrationsManage: can("integrations.manage"),
    deliveryCredentialsManage: can("delivery.credentials.manage"),
    backupManage: can("backups.read") && can("backups.create") && can("backups.restore"),
    riskManage: can("risk.manage"),
    dangerManage: can("settings.manage") && can("shops.delete"),
  };
  const integrations = access.integrationsManage
    ? await db.integration.findMany({ orderBy: { platform: "asc" } })
    : [];
  const { t } = await getI18n();
  return <div className="app-content page-sections"><PageHeader title={t("nav.settings")} description={t("settings.subtitle")} /><SettingsTabs access={access} integrations={integrations.map((integration) => ({ platform: integration.platform, status: integration.isActive ? "active" : "inactive" }))} /></div>;
}
