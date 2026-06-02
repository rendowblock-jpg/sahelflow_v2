/**
 * AI Chat Messages API
 * POST /api/ai/sessions/[id]/messages — add message to session
 */
import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { addMessage, autoTitleSession } from "@/lib/data/chat-service";

export const POST = withAuthAndRateLimit(
	async (req, { sellerId, params }) => {
		try {
			const { id } = params;
			const body = await req.json();
			const { role, content, toolCalls, actionCards, isFirstMessage } = body;

			if (!role || !content) {
				return NextResponse.json(
					{ error: "role and content are required" },
					{ status: 400 },
				);
			}

			const message = await addMessage(
				id as string,
				role,
				content,
				toolCalls,
				actionCards,
			);

			// Auto-title the session from the first user message
			if (isFirstMessage && role === "user") {
				await autoTitleSession(sellerId, id as string, content).catch(() => {});
			}

			return NextResponse.json({ message }, { status: 201 });
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return NextResponse.json({ error: msg }, { status: 500 });
		}
	},
	{ requireAuth: true, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);
