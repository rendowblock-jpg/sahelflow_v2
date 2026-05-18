import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

type ApiHandler<T = unknown> = (
	req: NextRequest,
	ctx: {
		user: { id: string; email?: string };
		supabase: Awaited<ReturnType<typeof createClient>>;
		body?: T;
	},
) => Promise<NextResponse>;

interface WrapperOptions<T extends z.ZodTypeAny> {
	schema?: T;
	requireAuth?: boolean;
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
	return async (req: NextRequest) => {
		try {
			const {
				requireAuth = true,
				schema,
				rateLimitConfig = { maxRequests: 60, windowMs: 60000 },
			} = options;

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

			// 2. Rate Limiting Check
			// Use User ID if authenticated, else IP address (from headers securely passed by Next.js)
			const forwardedFor = req.headers.get("x-forwarded-for");
			const ip = forwardedFor
				? forwardedFor.split(",")[0]?.trim() || "anonymous"
				: "anonymous";
			const rateLimitKey = user
				? `user:${user.id}:${req.nextUrl.pathname}`
				: `ip:${ip}:${req.nextUrl.pathname}`;

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
				supabase,
				body: validatedBody,
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
