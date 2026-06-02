/**
 * AI Chat Sessions API
 * GET /api/ai/sessions — list sessions for authenticated seller
 * POST /api/ai/sessions — create session for authenticated seller
 */
import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { listSessions, createSession } from "@/lib/data/chat-service";

export const GET = withAuthAndRateLimit(
	async (_req, { sellerId }) => {
		try {
			const sessions = await listSessions(sellerId);
			return NextResponse.json({ sessions });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return NextResponse.json({ error: message }, { status: 500 });
		}
	},
	{ requireAuth: true, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);

export const POST = withAuthAndRateLimit(
	async (req, { sellerId }) => {
		try {
			const body = await req.json();
			const session = await createSession(sellerId, body.title);
			return NextResponse.json({ session }, { status: 201 });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return NextResponse.json({ error: message }, { status: 500 });
		}
	},
	{ requireAuth: true, rateLimitConfig: { maxRequests: 10, windowMs: 60000 } },
);
