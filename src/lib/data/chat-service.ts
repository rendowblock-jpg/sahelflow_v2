/**
 * AI Chat Session Service
 * Manages chat sessions and messages in Supabase
 * All operations are seller-scoped to prevent cross-tenant data leakage
 */
import { createClient } from "@/lib/supabase/server";

export interface ChatSession {
	id: string;
	seller_id: string;
	title: string;
	message_count: number;
	created_at: string;
	updated_at: string;
}

export interface ChatMessage {
	id: string;
	session_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	tool_calls: unknown[] | null;
	action_cards: unknown[] | null;
	created_at: string;
}

// ─── Sessions ───

export async function listSessions(
	sellerId: string,
	limit = 50,
): Promise<ChatSession[]> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("ai_chat_sessions")
		.select("*")
		.eq("seller_id", sellerId)
		.order("updated_at", { ascending: false })
		.limit(limit);
	if (error) throw new Error(`Failed to list sessions: ${error.message}`);
	return data || [];
}

export async function createSession(
	sellerId: string,
	title?: string,
): Promise<ChatSession> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("ai_chat_sessions")
		.insert({ seller_id: sellerId, title: title || "محادثة جديدة" })
		.select()
		.single();
	if (error) throw new Error(`Failed to create session: ${error.message}`);
	return data;
}

export async function getSession(
	sellerId: string,
	sessionId: string,
): Promise<ChatSession | null> {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("ai_chat_sessions")
		.select("*")
		.eq("id", sessionId)
		.eq("seller_id", sellerId)
		.single();
	if (error) throw new Error(`Failed to get session: ${error.message}`);
	return data;
}

export async function updateSessionTitle(
	sellerId: string,
	sessionId: string,
	title: string,
): Promise<void> {
	const supabase = await createClient();
	const { error } = await supabase
		.from("ai_chat_sessions")
		.update({ title })
		.eq("id", sessionId)
		.eq("seller_id", sellerId);
	if (error) throw new Error(`Failed to update session: ${error.message}`);
}

export async function deleteSession(
	sellerId: string,
	sessionId: string,
): Promise<void> {
	const supabase = await createClient();
	const { error } = await supabase
		.from("ai_chat_sessions")
		.delete()
		.eq("id", sessionId)
		.eq("seller_id", sellerId);
	if (error) throw new Error(`Failed to delete session: ${error.message}`);
}

// ─── Messages ───

export async function getSessionMessages(
	sellerId: string,
	sessionId: string,
): Promise<ChatMessage[]> {
	const supabase = await createClient();
	// W5 fix: Verify session belongs to this seller before returning messages.
	// Previously, anyone with a session UUID could read all messages.
	const { data: session } = await supabase
		.from("ai_chat_sessions")
		.select("id")
		.eq("id", sessionId)
		.eq("seller_id", sellerId)
		.single();
	if (!session) return [];

	const { data, error } = await supabase
		.from("ai_chat_messages")
		.select("*")
		.eq("session_id", sessionId)
		.order("created_at", { ascending: true });
	if (error) throw new Error(`Failed to get messages: ${error.message}`);
	return data || [];
}

export async function addMessage(
	sellerId: string,
	sessionId: string,
	role: "user" | "assistant" | "system",
	content: string,
	toolCalls?: unknown[],
	actionCards?: unknown[],
): Promise<ChatMessage> {
	const supabase = await createClient();
	// W5 fix: Verify session belongs to this seller before inserting.
	// Previously, anyone with a session UUID could write messages.
	const { data: session } = await supabase
		.from("ai_chat_sessions")
		.select("id")
		.eq("id", sessionId)
		.eq("seller_id", sellerId)
		.single();
	if (!session) throw new Error("Session not found or access denied");

	const { data, error } = await supabase
		.from("ai_chat_messages")
		.insert({
			session_id: sessionId,
			role,
			content,
			tool_calls: toolCalls || null,
			action_cards: actionCards || null,
		})
		.select()
		.single();
	if (error) throw new Error(`Failed to add message: ${error.message}`);
	return data;
}

// ─── Auto-title from first user message ───

export async function autoTitleSession(
	sellerId: string,
	sessionId: string,
	firstMessage: string,
): Promise<void> {
	const title =
		firstMessage.length > 40 ? firstMessage.slice(0, 40) + "…" : firstMessage;
	await updateSessionTitle(sellerId, sessionId, title);
}
