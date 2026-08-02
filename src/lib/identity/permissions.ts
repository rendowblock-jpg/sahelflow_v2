import { SahelFlowError } from "@/types/errors";

export const PHASE2_ACTIONS = Object.freeze([
  "shops.read",
  "shops.switch",
  "shops.create",
  "shops.delete",
  "members.read",
  "members.manage",
  "devices.read",
  "devices.manage",
  "sessions.read",
  "sessions.revoke",
  "workgroups.read",
  "workgroups.manage",
  "queues.read",
  "queues.manage",
  "comments.read",
  "comments.write",
  "conversations.read",
  "conversations.update",
  "conversations.reply",
  "conversations.claim",
  "conversations.assign",
  "whatsapp.connection.manage",
  "orders.read",
  "orders.create",
  "orders.update",
  "orders.delete",
  "orders.assign",
  "customers.contact.read",
  "customers.contact.update",
  "orders.financials.read",
  "orders.financials.update",
  "products.read",
  "products.manage",
  "products.cost.read",
  "products.cost.update",
  "customers.read",
  "customers.manage",
  "accounting.read",
  "accounting.update",
  "analytics.read",
  "analytics.financials.read",
  "deliveries.read",
  "deliveries.manage",
  "delivery.credentials.manage",
  "automations.read",
  "automations.manage",
  "ai.use",
  "backups.read",
  "backups.create",
  "backups.restore",
  "data.export",
  "data.import",
  "integrations.read",
  "integrations.manage",
  "risk.read",
  "risk.manage",
  "settings.read",
  "settings.manage",
  "storefront.read",
  "storefront.manage",
  "storefront.publish",
  "license.read",
  "license.manage",
  "approvals.request",
  "approvals.approve",
] as const);

export type Phase2Action = (typeof PHASE2_ACTIONS)[number];
export type Phase2Role = "owner" | "manager" | "operator" | "viewer";

/**
 * A PIN-unlocked compatibility owner is authenticated but is not yet a durable
 * workspace member. Until the protected installation control cache exists it
 * can read only the exact process shop and cannot administer workspace shops,
 * members, devices, sessions, or collaboration work.
 */
export const COMPATIBILITY_LOCAL_OWNER_ACTIONS = Object.freeze([
  "shops.read",
] as const satisfies readonly Phase2Action[]);

const ACTIONS = new Set<string>(PHASE2_ACTIONS);
const PRESET_PERMISSIONS: Readonly<Record<Phase2Role, readonly Phase2Action[]>> = {
  owner: PHASE2_ACTIONS,
  manager: Object.freeze([
    "shops.read",
    "shops.switch",
    "members.read",
    "devices.read",
    "sessions.read",
    "workgroups.read",
    "workgroups.manage",
    "queues.read",
    "queues.manage",
    "comments.read",
    "comments.write",
    "conversations.read",
    "conversations.update",
    "conversations.reply",
    "conversations.claim",
    "conversations.assign",
    "whatsapp.connection.manage",
    "orders.read",
    "orders.create",
    "orders.update",
    "orders.assign",
    "customers.contact.read",
    "customers.contact.update",
    "orders.financials.read",
    "orders.financials.update",
    "products.read",
    "products.manage",
    "products.cost.read",
    "products.cost.update",
    "customers.read",
    "customers.manage",
    "accounting.read",
    "accounting.update",
    "analytics.read",
    "analytics.financials.read",
    "deliveries.read",
    "deliveries.manage",
    "automations.read",
    "automations.manage",
    "ai.use",
    "backups.create",
    "data.export",
    "data.import",
    "integrations.read",
    "risk.read",
    "risk.manage",
    "settings.read",
    "settings.manage",
    "storefront.read",
    "storefront.manage",
    "license.read",
    "approvals.request",
  ]),
  operator: Object.freeze([
    "shops.read",
    "shops.switch",
    "workgroups.read",
    "queues.read",
    "comments.read",
    "comments.write",
    "conversations.read",
    "conversations.update",
    "conversations.reply",
    "conversations.claim",
    "orders.read",
    "orders.update",
    "customers.contact.read",
    "customers.contact.update",
    "products.read",
    "customers.read",
    "customers.manage",
    "deliveries.read",
    "deliveries.manage",
    "automations.read",
    "ai.use",
    "risk.read",
    "approvals.request",
  ]),
  viewer: Object.freeze([
    "shops.read",
    "workgroups.read",
    "queues.read",
    "comments.read",
    "conversations.read",
    "orders.read",
    "products.read",
    "customers.read",
    "deliveries.read",
    "analytics.read",
    "risk.read",
  ]),
};

function invalidPolicy(): never {
  throw new SahelFlowError(
    "The current member permission policy is invalid; access is denied until it is repaired",
    "AUTHORIZATION_POLICY_INVALID",
    503,
  );
}

/** Return one immutable preset ceiling for server projections and invitation UI. */
export function getPhase2PresetPermissions(
  role: Phase2Role,
): readonly Phase2Action[] {
  return PRESET_PERMISSIONS[role];
}

/**
 * Resolve a role preset or an exact custom allowlist.
 *
 * A non-null custom policy replaces (rather than augments) the preset. This is
 * deliberately deny-by-default: newly introduced actions cannot be inherited
 * by an old custom role, and malformed policy never falls back to a broader
 * preset. Owner authority is fixed because owner recovery is handled through a
 * separate high-risk ceremony in later Phase 2 packages.
 */
export function resolvePhase2Permissions(
  role: Phase2Role,
  permissionsJson: string | null,
): readonly Phase2Action[] {
  if (role === "owner") return PRESET_PERMISSIONS.owner;
  if (permissionsJson === null) return PRESET_PERMISSIONS[role];

  let parsed: unknown;
  try {
    parsed = JSON.parse(permissionsJson);
  } catch {
    return invalidPolicy();
  }
  if (!Array.isArray(parsed)) return invalidPolicy();

  const permissions = new Set<Phase2Action>();
  const roleCeiling = new Set<Phase2Action>(PRESET_PERMISSIONS[role]);
  for (const value of parsed) {
    if (
      typeof value !== "string" ||
      !ACTIONS.has(value) ||
      !roleCeiling.has(value as Phase2Action)
    ) {
      return invalidPolicy();
    }
    permissions.add(value as Phase2Action);
  }
  return Object.freeze([...permissions].sort());
}

export function hasPhase2Permission(
  permissions: readonly Phase2Action[],
  action: Phase2Action,
): boolean {
  return permissions.includes(action);
}
