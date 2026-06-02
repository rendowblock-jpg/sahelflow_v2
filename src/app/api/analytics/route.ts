import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createAdminClient } from "@/lib/supabase/server";

const rangeSchema = z.object({
	range: z.enum(["today", "7d", "30d", "all"]).optional(),
});

/**
 * GET /api/analytics?range=today|7d|30d|all
 * Returns analytics data for the authenticated seller.
 * Uses service_role client to call the SECURITY DEFINER RPC.
 */
export const GET = withAuthAndRateLimit(
	async (req, { user: _user, sellerId }) => {
		const url = new URL(req.url);
		const rawRange = url.searchParams.get("range") ?? "30d";
		const parsed = rangeSchema.safeParse({ range: rawRange });
		const range = parsed.success ? parsed.data.range! : "30d";

		const adminClient = createAdminClient();
		const { data, error } = await adminClient.rpc(
			"get_analytics_data",
			{ p_range: range, p_seller_id: sellerId },
			{ head: false },
		);
		if (error) {
			console.log(
				JSON.stringify({ type: "analytics_rpc_error", error: error.message }),
			);
			return NextResponse.json(
				{ error: "Failed to load analytics data" },
				{ status: 500 },
			);
		}
		return NextResponse.json(data ?? {});
	},
	{ requireAuth: true, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);

