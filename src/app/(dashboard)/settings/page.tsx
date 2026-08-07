import type { Metadata } from "next";

import { SettingsTabs, type SettingsTabAccess } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.metaTitle") };
}

export default async function SettingsPage() {
  const actorContext = await requireTrustedAction("settings.read");
  const { t } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);

  const access: SettingsTabAccess = {
    profile: true,
    security: can("sessions.read") || can("devices.read"),
    team: can("members.read"),
    appearance: true,
    license: can("license.read"),
    demo: can("settings.manage"),
    ai: can("integrations.manage") || can("settings.manage"),
    delivery: can("delivery.credentials.manage") || can("integrations.read"),
    reports: can("settings.manage"),
    integrations: can("integrations.read"),
    phone: can("risk.read"),
    backup: can("backups.read") || can("backups.create"),
    danger: can("settings.manage"),
  };
  const integrations = access.integrations
    ? await db.integration.findMany({
        orderBy: [{ platform: "asc" }, { id: "asc" }],
        select: { platform: true, isActive: true },
      })
    : [];

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.settings")} description={t("settings.subtitle")} />
      <SettingsTabs
        access={access}
        integrations={integrations.map((integration) => ({
          platform: integration.platform,
          status: integration.isActive ? "active" : "inactive",
        }))}
      />
    </div>
  );
}
