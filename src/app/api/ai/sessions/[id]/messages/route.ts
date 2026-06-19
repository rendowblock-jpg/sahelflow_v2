/**
 * AI Chat Messages API
 * POST /api/ai/sessions/[id]/messages — add message to session
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { addMessage, autoTitleSession } from "@/lib/data/chat-service";

export const POST = withAuthAndRateLimit(
	async (req, { sellerId, params, body }) => {
		try {
			const { id } = params;
			// M5 fix: all fields validated by schema
			const { role, content, toolCalls, actionCards, isFirstMessage } = body!;

			const message = await addMessage(
				sellerId,
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
	{
		requirePermission: "ai:chat",
		requireAuth: true,
		schema: z.object({
			role: z.enum(["user", "assistant"]),
			content: z.string().min(1).max(8000),
			toolCalls: z.array(z.unknown()).optional(),
			actionCards: z.array(z.unknown()).optional(),
			isFirstMessage: z.boolean().optional(),
		}),
		rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
	},
);
