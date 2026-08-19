import type { Metadata } from "next";

import {
  SettingsWorkspace,
  type SettingsWorkspaceAccess,
  type SettingsWorkspaceGroup,
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

const SETTINGS_GROUPS = new Set<SettingsWorkspaceGroup>([
  "workspace",
  "operations",
  "connections",
  "intelligence",
  "access",
  "data",
]);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const actorContext = await requireTrustedAction("settings.read");
  const { t } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);
  const canAll = (
    actions: readonly Parameters<typeof trustedActionAllowed>[1][],
  ) => actions.every((action) => can(action));

  const profileManage = can("settings.manage");
  const access: SettingsWorkspaceAccess = {
    profile: true,
    profileManage,
    security: can("sessions.read") || can("devices.read"),
    team: can("members.read"),
    appearance: true,
    license: can("license.read"),
    demo: profileManage,
    aiKey: can("integrations.manage"),
    aiConsent: profileManage,
    delivery: can("delivery.credentials.manage"),
    reports: profileManage,
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
    dangerReset: profileManage && can("approvals.approve"),
  };
  const integrations = access.commerceRead || access.commerceManage
    ? await db.integration.findMany({
        where: { platform: { in: ["shopify", "woocommerce", "youcan"] } },
        orderBy: [{ platform: "asc" }, { id: "asc" }],
        select: { platform: true, isActive: true },
      })
    : [];
  const params = await searchParams;
  const initialGroup = SETTINGS_GROUPS.has(params.group as SettingsWorkspaceGroup)
    ? (params.group as SettingsWorkspaceGroup)
    : undefined;

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.settings")} description={t("settings.subtitle")} />
      <SettingsWorkspace
        access={access}
        initialGroup={initialGroup}
        integrations={integrations.map((integration) => ({
          platform: integration.platform,
          status: integration.isActive ? "active" : "inactive",
        }))}
      />
    </div>
  );
}
