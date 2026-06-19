/**
 * AI Chat Session Detail API
 * GET /api/ai/sessions/[id] — get session with messages
 * PATCH /api/ai/sessions/[id] — update session title
 * DELETE /api/ai/sessions/[id] — delete session
 */
import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import {
	getSession,
	updateSessionTitle,
	deleteSession,
} from "@/lib/data/chat-service";

export const GET = withAuthAndRateLimit(
	async (_req, { sellerId, params }) => {
		try {
			const { id } = params;
			const session = await getSession(sellerId, id as string);
			if (!session) {
				return NextResponse.json(
					{ error: "Session not found" },
					{ status: 404 },
				);
			}
			return NextResponse.json({ session });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return NextResponse.json({ error: message }, { status: 500 });
		}
	},
	{ requirePermission: "ai:chat", requireAuth: true, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);

export const PATCH = withAuthAndRateLimit(
	async (req, { sellerId, params }) => {
		try {
			const { id } = params;
			const body = await req.json();
			await updateSessionTitle(sellerId, id as string, body.title);
			return NextResponse.json({ success: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return NextResponse.json({ error: message }, { status: 500 });
		}
	},
	{ requirePermission: "ai:chat", requireAuth: true, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);

export const DELETE = withAuthAndRateLimit(
	async (_req, { sellerId, params }) => {
		try {
			const { id } = params;
			await deleteSession(sellerId, id as string);
			return NextResponse.json({ success: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return NextResponse.json({ error: message }, { status: 500 });
		}
	},
	{ requirePermission: "ai:chat", requireAuth: true, rateLimitConfig: { maxRequests: 10, windowMs: 60000 } },
);
