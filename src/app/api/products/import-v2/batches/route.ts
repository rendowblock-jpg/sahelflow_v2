import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

const querySchema = z.object({
	limit: z.coerce.number().min(1).max(100).default(50),
	offset: z.coerce.number().min(0).default(0),
});

export const GET = withAuthAndRateLimit(
	async (req, { user: _user, sellerId, supabase }) => {
		const { searchParams } = new URL(req.url);
		const { limit, offset } = querySchema.parse(
			Object.fromEntries(searchParams),
		);

		const { data, error, count } = await supabase
			.from("import_batches")
			.select(
				"id, source, filename, row_count, created_count, skipped_count, error_count, status, column_mapping, validation_errors, created_at, committed_at",
				{ count: "exact" },
			)
			.eq("seller_id", sellerId)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			console.log(JSON.stringify({ type: "import_v2_batches_error", error: error.message }));
			return NextResponse.json(
				{ error: "Failed to fetch batches" },
				{ status: 500 },
			);
		}

		return NextResponse.json({ batches: data || [], count: count || 0 });
	},
	{
		requirePermission: "products:manage",
		schema: z.object({}),
		rateLimitConfig: { maxRequests: 30, windowMs: 60000 },
	},
);
