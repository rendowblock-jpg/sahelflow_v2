export type TeamRole = "owner" | "admin" | "confirmer" | "packer" | "viewer";

export interface UserPermissionContext {
	userId: string;
	sellerId: string;
	role: TeamRole;
}

export const ROLE_PERMISSIONS: Record<TeamRole, string[]> = {
	owner: ["*"], // Complete administrative control
	admin: [
		"dashboard:view",
		"orders:view",
		"orders:manage",
		"orders:confirm",
		"products:view",
		"products:manage",
		"customers:view",
		"customers:manage",
		"inbox:view",
		"inbox:send",
		"settings:view",
		"settings:manage",
		"team:view",
		"team:manage",
		"accounting:view",
		"accounting:manage",
		"automations:view",
		"automations:manage",
		"ai:chat",
		"returns:view",
		"returns:manage",
	],
	confirmer: [
		"dashboard:view",
		"orders:view",
		"orders:manage",
		"orders:confirm",
		"customers:view",
		"customers:manage",
		"inbox:view",
		"inbox:send",
		"ai:chat",
		"returns:view",
		"returns:manage",
	],
	packer: [
		"dashboard:view",
		"orders:view",
		"products:view",
		"products:manage",
	],
	viewer: [
		"dashboard:view",
		"orders:view",
		"products:view",
		"customers:view",
		"returns:view",
	],
};

/**
 * Checks if a role is authorized to perform a specific action.
 */
const VALID_PERMISSIONS = new Set<string>(
	Object.values(ROLE_PERMISSIONS).flat(),
);

export function hasPermission(role: TeamRole, action: string): boolean {
	if (role === "owner") return true;
	const permissions = ROLE_PERMISSIONS[role] || [];
	return permissions.includes(action) || permissions.includes("*");
}

/**
 * W17 fix: Strict permission check that validates the action string exists in
 * ROLE_PERMISSIONS. Catches typos like "ordrs:manage" that would silently pass
 * for owner (hasPermission returns true for any string when role === "owner").
 *
 * Use this in development/debugging to catch permission string typos.
 * Production code should use hasPermission (owners bypass checks by design).
 */
export function hasPermissionStrict(role: TeamRole, action: string): boolean {
	if (!VALID_PERMISSIONS.has(action)) {
		console.warn(
			`[permissions] Unknown permission string: "${action}". ` +
			`This may be a typo. Valid permissions: ${[...VALID_PERMISSIONS].join(", ")}`,
		);
	}
	return hasPermission(role, action);
}

/**
 * Helper checks for specific module views/actions
 */
export function canViewAccounting(role: TeamRole): boolean {
	return hasPermission(role, "accounting:view");
}

export function canManageTeam(role: TeamRole): boolean {
	return hasPermission(role, "team:manage");
}

export function canManageSettings(role: TeamRole): boolean {
	return hasPermission(role, "settings:manage");
}

export function canDeleteData(role: TeamRole): boolean {
	// Only owners can do absolute deletions of critical entities
	return role === "owner";
}
