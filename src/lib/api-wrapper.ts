import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasPermission, type TeamRole } from "@/lib/auth/permissions";
import { z } from "zod";

/** Resolved params record passed to handlers after awaiting the Next.js Promise. */
type ResolvedParams = Record<string, string | string[] | undefined>;

type ApiHandler<T = unknown> = (
	req: NextRequest,
	ctx: {
		user: { id: string; email?: string };
		sellerId: string;
		role: TeamRole;
		supabase: Awaited<ReturnType<typeof createClient>>;
		body?: T;
		params: ResolvedParams;
	},
) => Promise<NextResponse>;

interface WrapperOptions<T extends z.ZodTypeAny> {
	schema?: T;
	requireAuth?: boolean;
	/**
	 * Permission string (from ROLE_PERMISSIONS in lib/auth/permissions.ts) that the
	 * caller's role must possess. Enforced after auth + seller-context resolution.
	 * Solo sellers (no team_members row) are treated as "owner" and always pass.
	 * If omitted, no permission check is applied (backward-compatible).
	 */
	requirePermission?: string;
	rateLimitConfig?: {
		maxRequests: number;
		windowMs: number;
	};
}

/**
 * Standardized API Wrapper for SahelFlow
 * Enforces Auth, Rate Limiting, and Zod Validation uniformly across all endpoints.
 */
export function withAuthAndRateLimit<T extends z.ZodTypeAny>(
	handler: ApiHandler<z.infer<T>>,
	options: WrapperOptions<T> = {},
) {
	return async (
		req: NextRequest,
		context?: { params?: Promise<ResolvedParams> },
	) => {
		try {
			const {
				requireAuth = true,
				schema,
				requirePermission,
				rateLimitConfig = { maxRequests: 60, windowMs: 60000 },
			} = options;

			// Resolve async params from Next.js 15 route context
			const resolvedParams: ResolvedParams = context?.params
				? await context.params
				: {};

			const supabase = await createClient();
			let user = null;

			// 1. Authentication Check
			if (requireAuth) {
				const { data: authData, error: authError } =
					await supabase.auth.getUser();
				if (authError || !authData.user) {
					return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
				}
				user = authData.user;
			}

			// Resolve active sellerId + role if authenticated
			let sellerId = "";
			let role: TeamRole = "owner"; // solo sellers (no team_members row) are owners
			if (user) {
				const { getUserSellerContext } = await import("@/lib/data/team-service");
				const teamCtx = await getUserSellerContext(user.id);
				if (teamCtx) {
					if (teamCtx.status === "suspended") {
						return NextResponse.json(
							{ error: "Forbidden: Your team member account has been suspended" },
							{ status: 403 },
						);
					}
					// W6 fix: Invited members haven't accepted their invite yet —
					// block API access until they do.
					if (teamCtx.status === "invited") {
						return NextResponse.json(
							{ error: "Forbidden: Please accept your team invitation to access this account" },
							{ status: 403 },
						);
					}
					sellerId = teamCtx.sellerId;
					role = teamCtx.role;
				} else {
					sellerId = user.id;
					role = "owner";
				}

				// RBAC enforcement (S3) — if route declares a required permission,
				// reject callers whose role doesn't possess it.
				if (requirePermission && !hasPermission(role, requirePermission)) {
					return NextResponse.json(
						{ error: "Forbidden: insufficient permissions", required: requirePermission, role },
						{ status: 403 },
					);
				}
			}

			// 2. Rate Limiting Check
			// Use User ID if authenticated, else IP address (from headers securely passed by Next.js)
			const forwardedFor = req.headers.get("x-forwarded-for");
			const ip = forwardedFor
				? forwardedFor.split(",")[0]?.trim() || "anonymous"
				: "anonymous";
			// W20 fix: Include HTTP method in rate limit key. Previously, GETs and
			// POSTs to the same path shared the same bucket — a flood of GETs could
			// exhaust the POST budget (and vice versa).
			const rateLimitKey = user
				? `user:${user.id}:${req.method}:${req.nextUrl.pathname}`
				: `ip:${ip}:${req.method}:${req.nextUrl.pathname}`;

			const rl = await rateLimit(
				rateLimitKey,
				rateLimitConfig.maxRequests,
				rateLimitConfig.windowMs,
			);
			if (!rl.allowed) {
				return NextResponse.json(
					{ error: "Too many requests" },
					{ status: 429, headers: rateLimitHeaders(rl) },
				);
			}

			// 3. Schema Validation
			let validatedBody: z.infer<T> | undefined;
			if (schema && ["POST", "PUT", "PATCH"].includes(req.method)) {
				let body;
				try {
					body = await req.json();
				} catch {
					return NextResponse.json(
						{ error: "Invalid JSON body" },
						{ status: 400 },
					);
				}

				const parsed = schema.safeParse(body);
				if (!parsed.success) {
					return NextResponse.json(
						{
							error: "Validation Error",
							details: (parsed.error.issues as Array<{ message: string }>).map(
								(i) => i.message,
							),
						},
						{ status: 400 },
					);
				}
				validatedBody = parsed.data;
			}

			// 4. Execute Handler
			const response = await handler(req, {
				user: user as { id: string; email?: string }, // Only non-null if requireAuth is true
				sellerId,
				role,
				supabase,
				body: validatedBody,
				params: resolvedParams,
			});

			// Add rate limit headers to successful response
			Object.entries(rateLimitHeaders(rl)).forEach(([key, value]) => {
				response.headers.set(key, value);
			});

			return response;
		} catch (error) {
			console.log(
				JSON.stringify({
					type: "api_wrapper_error",
					method: req.method,
					path: req.nextUrl.pathname,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return NextResponse.json(
				{ error: "Internal Server Error" },
				{ status: 500 },
			);
		}
	};
}
