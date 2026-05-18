import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

/**
 * GET /api/dashboard/stats
 * Returns dashboard aggregate stats for the authenticated seller.
 * Uses service_role client to call the SECURITY DEFINER RPC.
 */
export const GET = withAuthAndRateLimit(
	async (_req, { user: _user, supabase }) => {
		const { data, error } = await supabase.rpc(
			"get_dashboard_aggregates",
			{},
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
