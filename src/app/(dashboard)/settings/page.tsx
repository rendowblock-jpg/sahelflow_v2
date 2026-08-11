import type { Metadata } from "next";

import {
  SettingsWorkspace,
  type SettingsWorkspaceAccess,
} from "@/components/settings/settings-workspace";
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
  const canAll = (
    actions: readonly Parameters<typeof trustedActionAllowed>[1][],
  ) => actions.every((action) => can(action));

  const access: SettingsWorkspaceAccess = {
    profile: true,
    security: can("sessions.read") || can("devices.read"),
    team: can("members.read"),
    appearance: true,
    license: can("license.read"),
    demo: can("settings.manage"),
    aiKey: can("integrations.manage"),
    aiConsent: can("settings.manage"),
    delivery: can("delivery.credentials.manage"),
    reports: can("settings.manage"),
    commerceRead: can("integrations.read"),
    commerceManage: can("integrations.manage"),
    commerceSync: canAll([
      "integrations.manage",
      "data.import",
      "orders.create",
      "customers.contact.read",
      "customers.contact.update",
      "orders.financials.read",
      "orders.financials.update",
    ]),
    phone: can("risk.read"),
    phoneManage: can("risk.manage"),
    backupRead: can("backups.read"),
    backupCreate: can("backups.create"),
    backupRestore: can("backups.restore") && can("approvals.approve"),
    dataExport: canAll([
      "data.export",
      "orders.read",
      "customers.contact.read",
      "orders.financials.read",
    ]),
    dangerReset: can("settings.manage") && can("approvals.approve"),
  };
  const integrations = access.commerceRead || access.commerceManage
    ? await db.integration.findMany({
        where: { platform: { in: ["shopify", "woocommerce", "youcan"] } },
        orderBy: [{ platform: "asc" }, { id: "asc" }],
        select: { platform: true, isActive: true },
      })
    : [];

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.settings")} description={t("settings.subtitle")} />
      <SettingsWorkspace
        access={access}
        integrations={integrations.map((integration) => ({
          platform: integration.platform,
          status: integration.isActive ? "active" : "inactive",
        }))}
      />
    </div>
  );
}
