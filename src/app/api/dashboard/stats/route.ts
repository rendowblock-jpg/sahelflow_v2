import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/dashboard/stats
 * Returns dashboard aggregate stats for the authenticated seller.
 * Uses service_role client to call the SECURITY DEFINER RPC.
 */
export const GET = withAuthAndRateLimit(
	async (_req, { user: _user, sellerId }) => {
		const adminClient = createAdminClient();
		const { data, error } = await adminClient.rpc(
			"get_dashboard_aggregates",
			{ p_seller_id: sellerId },
			{ head: false },
		);
		if (error) {
			console.log(
				JSON.stringify({
					type: "dashboard_stats_rpc_error",
					error: error.message,
				}),
			);
			return NextResponse.json(
				{ error: "Failed to load dashboard stats" },
				{ status: 500 },
			);
		}
		return NextResponse.json(data ?? {});
	},
	{ requireAuth: true, rateLimitConfig: { maxRequests: 30, windowMs: 60000 } },
);

