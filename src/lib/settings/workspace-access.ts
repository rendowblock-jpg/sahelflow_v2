import "server-only";

import {
  resolveSettingsTarget,
  type SettingsWorkspaceAccess,
} from "@/components/settings/settings-ia";
import { db } from "@/lib/db";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export interface SettingsWorkspaceProps {
  access: SettingsWorkspaceAccess;
  integrations: Array<{ platform: string; status: string }>;
  /** A settings page id; legacy `?group=` domains resolve to their page. */
  initialGroup?: string;
}

/**
 * The one server authority for what the Settings workspace offers.
 *
 * Shared by the full `/settings` page and the intercepted Settings modal so the
 * two entry points can never disagree about which surfaces an actor may see.
 * Every panel route still enforces its own action on write; this only decides
 * whether a surface is offered at all.
 */
export async function resolveSettingsWorkspaceProps(
  requestedGroup: string | undefined,
): Promise<SettingsWorkspaceProps> {
  // Every signed-in member reaches Settings for their own account and
  // appearance; shop surfaces below are offered only to roles that hold them.
  const actorContext = await requireTrustedActor();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);
  const canAll = (
    actions: readonly Parameters<typeof trustedActionAllowed>[1][],
  ) => actions.every((action) => can(action));

  const profileManage = can("settings.manage");
  const teamMember =
    actorContext.actor.kind === "person" && actorContext.actor.role !== "owner";
  const access: SettingsWorkspaceAccess = {
    myAccount: teamMember,
    // The profile is the shop's public owner profile, not the member's own.
    profile: can("settings.read"),
    profileManage,
    security: can("sessions.read") || can("devices.read"),
    // The route enforces owner-only authority itself; this only decides
    // whether the surface is offered at all.
    changePin: can("members.manage"),
    // Rename/archive/recover need shops.create; permanent delete additionally
    // needs shops.delete, which the native layer enforces per action.
    shopsManage: can("shops.create") || can("shops.delete"),
    team: can("members.read"),
    appearance: true,
    license: can("license.read"),
    demo: can("settings.manage"),
    aiKey: can("integrations.manage"),
    aiConsent: can("settings.manage"),
    // The Meta Pixel route enforces settings.manage itself; this only decides
    // whether the write surface is offered in the Connections domain.
    metaPixelManage: can("settings.manage"),
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
  const integrations =
    access.commerceRead || access.commerceManage
      ? await db.integration.findMany({
          where: { platform: { in: ["shopify", "woocommerce", "youcan"] } },
          orderBy: [{ platform: "asc" }, { id: "asc" }],
          select: { platform: true, isActive: true },
        })
      : [];
  const initialGroup = resolveSettingsTarget(requestedGroup);

  return {
    access,
    initialGroup,
    integrations: integrations.map((integration) => ({
      platform: integration.platform,
      status: integration.isActive ? "active" : "inactive",
    })),
  };
}
