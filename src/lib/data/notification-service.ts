/**
 * SahelFlow Notification Service
 * Persistent notification CRUD with Supabase.
 */

import { getSupabase } from "./supabase-helpers";

export interface NotificationInput {
	type: "order" | "low_stock" | "risk" | "automation" | "system" | "welcome";
	title: string;
	message: string;
	link?: string;
	metadata?: Record<string, unknown>;
}

export async function getNotifications(options?: {
	limit?: number;
	unreadOnly?: boolean;
}) {
	const limit = options?.limit ?? 50;
	let query = getSupabase()
		.from("notifications")
		.select("*")
		.eq("dismissed", false)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (options?.unreadOnly) {
		query = query.eq("read", false);
	}

	const { data, error } = await query;
	if (error) throw error;
	return data ?? [];
}

export async function getUnreadNotificationCount() {
	const { count, error } = await getSupabase()
		.from("notifications")
		.select("*", { count: "exact", head: true })
		.eq("read", false)
		.eq("dismissed", false);
	if (error) throw error;
	return count ?? 0;
}

export async function markNotificationRead(id: string) {
	const { error } = await getSupabase()
		.from("notifications")
		.update({ read: true })
		.eq("id", id);
	if (error) throw error;
}

export async function markAllNotificationsRead() {
	const { error } = await getSupabase()
		.from("notifications")
		.update({ read: true })
		.eq("read", false)
		.eq("dismissed", false);
	if (error) throw error;
}

export async function dismissNotification(id: string) {
	const { error } = await getSupabase()
		.from("notifications")
		.update({ dismissed: true })
		.eq("id", id);
	if (error) throw error;
}

export async function createNotification(input: NotificationInput) {
	const { data: user } = await getSupabase().auth.getUser();
	if (!user.user) throw new Error("Not authenticated");

	const { data, error } = await getSupabase()
		.from("notifications")
		.insert({
			seller_id: user.user.id,
			...input,
		})
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function deleteNotification(id: string) {
	const { error } = await getSupabase()
		.from("notifications")
		.delete()
		.eq("id", id);
	if (error) throw error;
}
