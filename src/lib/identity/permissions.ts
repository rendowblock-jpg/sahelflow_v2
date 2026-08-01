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
  "conversations.read",
  "conversations.claim",
  "conversations.assign",
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
    "conversations.read",
    "conversations.claim",
    "conversations.assign",
  ]),
  operator: Object.freeze([
    "shops.read",
    "shops.switch",
    "conversations.read",
    "conversations.claim",
  ]),
  viewer: Object.freeze([
    "shops.read",
    "conversations.read",
  ]),
};

function invalidPolicy(): never {
  throw new SahelFlowError(
    "The current member permission policy is invalid; access is denied until it is repaired",
    "AUTHORIZATION_POLICY_INVALID",
    503,
  );
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
