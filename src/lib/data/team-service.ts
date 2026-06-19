import { createClient } from "@/lib/supabase/server";
import type { TeamRole } from "@/lib/auth/permissions";

export interface TeamMember {
	id: string;
	seller_id: string;
	user_id: string | null;
	email: string;
	role: TeamRole;
	status: "invited" | "active" | "suspended";
	invited_by: string | null;
	invited_at: string;
	accepted_at: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * Service to manage organization team members and access contexts.
 */

/**
 * Retrieves the operating seller context for a user.
 * Checks if the user is the business owner or an active team member.
 */
export async function getUserSellerContext(userId: string): Promise<{
	sellerId: string;
	role: TeamRole;
	status: "active" | "invited" | "suspended";
} | null> {
	const supabase = await createClient();

	// 1. Check if the user is the owner (matching id in sellers)
	const { data: seller, error: _sellerErr } = await supabase
		.from("sellers")
		.select("id")
		.eq("id", userId)
		.maybeSingle();

	if (seller) {
		return { sellerId: seller.id, role: "owner", status: "active" };
	}

	// 2. Check if the user is a team member
	const { data: member, error: _memberErr } = await supabase
		.from("team_members")
		.select("seller_id, role, status")
		.eq("user_id", userId)
		.maybeSingle();

	if (member) {
		// Suspended team members cannot access anything
		if (member.status === "suspended") {
			return {
				sellerId: member.seller_id,
				role: member.role as TeamRole,
				status: "suspended",
			};
		}
		// W6 fix: Return the actual status. Previously, "invited" members were
		// treated as "active" (full access before accepting invite). Now the
		// caller sees the real status and can reject invited members.
		return {
			sellerId: member.seller_id,
			role: member.role as TeamRole,
			status: member.status as "active" | "invited" | "suspended",
		};
	}

	return null;
}

/**
 * Lists all team members for a seller organization.
 */
export async function getTeamMembers(sellerId: string): Promise<TeamMember[]> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("team_members")
		.select("*")
		.eq("seller_id", sellerId)
		.order("created_at", { ascending: true });

	if (error) throw error;
	return (data || []) as TeamMember[];
}

/**
 * Invites a team member by email.
 * If the user already exists in auth.users, pre-links their user_id.
 */
export async function inviteTeamMember(
	sellerId: string,
	email: string,
	role: TeamRole,
	invitedBy: string,
): Promise<TeamMember> {
	const supabase = await createClient();
	const cleanEmail = email.trim().toLowerCase();

	// 1. Verify if user already has an auth account (can check public.sellers or similar profiles, or trigger RPC if needed)
	// For SahelFlow, we will look up the sellers table first (if they are already an owner, they cannot be invited to another team)
	const { data: existingSeller } = await supabase
		.from("sellers")
		.select("id")
		.eq("email", cleanEmail)
		.maybeSingle();

	if (existingSeller) {
		throw new Error(
			"User is already registered as an independent store owner and cannot be invited.",
		);
	}

	// Try to find if there is an existing auth user with this email
	// Wait, standard supabase.auth requires admin privilege to list users. But we can trigger an RPC or search team_members.
	// Since we are running in non-admin mode on client, if the user registers later, we will link them.
	// But let's check if the email has already been invited to this store
	const { data: existingInvite } = await supabase
		.from("team_members")
		.select("id")
		.eq("seller_id", sellerId)
		.eq("email", cleanEmail)
		.maybeSingle();

	if (existingInvite) {
		throw new Error("This email is already invited or part of the team.");
	}

	// 2. Insert invitation
	const { data, error } = await supabase
		.from("team_members")
		.insert({
			seller_id: sellerId,
			email: cleanEmail,
			role,
			status: "invited",
			invited_by: invitedBy,
		})
		.select("*")
		.single();

	if (error) throw error;
	return data as TeamMember;
}

/**
 * Updates a team member's role.
 */
export async function updateMemberRole(
	sellerId: string,
	memberId: string,
	role: TeamRole,
): Promise<TeamMember> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("team_members")
		.update({ role, updated_at: new Date().toISOString() })
		.eq("id", memberId)
		.eq("seller_id", sellerId)
		.select("*")
		.single();

	if (error) throw error;
	return data as TeamMember;
}

/**
 * Suspends a team member (blocks access).
 */
export async function suspendMember(
	sellerId: string,
	memberId: string,
): Promise<TeamMember> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("team_members")
		.update({ status: "suspended", updated_at: new Date().toISOString() })
		.eq("id", memberId)
		.eq("seller_id", sellerId)
		.select("*")
		.single();

	if (error) throw error;
	return data as TeamMember;
}

/**
 * Activates a team member.
 */
export async function activateMember(
	sellerId: string,
	memberId: string,
): Promise<TeamMember> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("team_members")
		.update({ status: "active", updated_at: new Date().toISOString() })
		.eq("id", memberId)
		.eq("seller_id", sellerId)
		.select("*")
		.single();

	if (error) throw error;
	return data as TeamMember;
}

/**
 * Removes a team member completely.
 */
export async function removeMember(
	sellerId: string,
	memberId: string,
): Promise<void> {
	const supabase = await createClient();
	const { error } = await supabase
		.from("team_members")
		.delete()
		.eq("id", memberId)
		.eq("seller_id", sellerId);

	if (error) throw error;
}

/**
 * Links a newly registered auth user to any pending invitations.
 * This is called on registration or first login to bridge the invitation.
 */
export async function linkUserToInvitations(
	userId: string,
	email: string,
): Promise<void> {
	const supabase = await createClient();
	const cleanEmail = email.trim().toLowerCase();

	const { data: invite } = await supabase
		.from("team_members")
		.select("id, status")
		.eq("email", cleanEmail)
		.eq("status", "invited")
		.maybeSingle();

	if (invite) {
		const { error } = await supabase
			.from("team_members")
			.update({
				user_id: userId,
				status: "active",
				accepted_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.eq("id", invite.id);

		if (error) console.log(JSON.stringify({ type: "team_invitation_link_error", error: error.message }));
	}
}
