import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware Session Handler — Phase 5.4: JWT-claim onboarding check
 *
 * Previous: 2-3 DB queries per dashboard request (team_members + sellers).
 * Now: Reads onboarding_completed from JWT app_metadata claim (set by
 * handle_new_user trigger + onboarding_claim_sync trigger on sellers).
 * Fallback: One DB query only if the claim is missing (legacy users
 * not yet backfilled).
 */

export async function updateSession(request: NextRequest) {
	let supabaseResponse = NextResponse.next({
		request,
	});

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value }) =>
						request.cookies.set(name, value),
					);
					supabaseResponse = NextResponse.next({
						request,
					});
					cookiesToSet.forEach(({ name, value, options }) =>
						supabaseResponse.cookies.set(name, value, options),
					);
				},
			},
		},
	);

	// Refresh the session
	const {
		data: { user },
	} = await supabase.auth.getUser();

	// Protected routes - redirect to login if not authenticated
	if (
		!user &&
		!request.nextUrl.pathname.startsWith("/login") &&
		!request.nextUrl.pathname.startsWith("/register") &&
		!request.nextUrl.pathname.startsWith("/auth") &&
		!request.nextUrl.pathname.startsWith("/onboarding") &&
		!request.nextUrl.pathname.startsWith("/api") &&
		request.nextUrl.pathname !== "/"
	) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		return NextResponse.redirect(url);
	}

	// Redirect authenticated users away from auth pages to dashboard
	if (
		user &&
		(request.nextUrl.pathname.startsWith("/login") ||
			request.nextUrl.pathname.startsWith("/register"))
	) {
		const url = request.nextUrl.clone();
		url.pathname = "/dashboard";
		return NextResponse.redirect(url);
	}

	// Onboarding redirect: check completion status from JWT claim
	if (
		user &&
		(request.nextUrl.pathname.startsWith("/dashboard") ||
			request.nextUrl.pathname.startsWith("/onboarding"))
	) {
		// Phase 5.4: Read onboarding_completed from JWT app_metadata claim
		// This avoids 2-3 DB queries per request (team_members + sellers)
		const onboardingCompleted = user.app_metadata?.onboarding_completed;
		const isSuspended = user.app_metadata?.account_status === "suspended";

		// If suspended, block access
		if (isSuspended) {
			const url = request.nextUrl.clone();
			url.pathname = "/login";
			return NextResponse.redirect(url);
		}

		const isOnboarding = request.nextUrl.pathname.startsWith("/onboarding");

		if (onboardingCompleted !== undefined) {
			// Fast path: JWT claim exists, no DB query needed
			if (onboardingCompleted && isOnboarding) {
				const url = request.nextUrl.clone();
				url.pathname = "/dashboard";
				return NextResponse.redirect(url);
			}
			if (!onboardingCompleted && !isOnboarding) {
				const url = request.nextUrl.clone();
				url.pathname = "/onboarding";
				return NextResponse.redirect(url);
			}
		} else {
			// Fallback: claim not yet set (pre-backfill legacy user) — single DB query
			try {
				const { data: seller } = await supabase
					.from("sellers")
					.select("onboarding_completed")
					.eq("id", user.id)
					.single();

				if (seller?.onboarding_completed && isOnboarding) {
					const url = request.nextUrl.clone();
					url.pathname = "/dashboard";
					return NextResponse.redirect(url);
				}
				if (!seller?.onboarding_completed && !isOnboarding) {
					const url = request.nextUrl.clone();
					url.pathname = "/onboarding";
					return NextResponse.redirect(url);
				}
			} catch {
				// If seller lookup fails, allow through
			}
		}
	}

	// Phase 6.15: Apply CSP header to HTML responses
	if (!request.nextUrl.pathname.startsWith("/api")) {
		supabaseResponse.headers.set("Content-Security-Policy", CSP_HEADER);
		supabaseResponse.headers.set("X-Frame-Options", "DENY");
		supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
		supabaseResponse.headers.set(
			"Referrer-Policy",
			"strict-origin-when-cross-origin",
		);
	}

	return supabaseResponse;
}

/**
 * Phase 6.15: Content-Security-Policy with strict-dynamic
 * Applied to all HTML responses via Next.js middleware headers.
 */
const CSP_HEADER = [
	`default-src 'self'`,
	`script-src 'self' 'strict-dynamic' https://cdn.sentry.io`,
	`style-src 'self' 'unsafe-inline'`, // Tailwind/styled-jsx require inline
	`img-src 'self' blob: data: https://*.supabase.co https://*.googleusercontent.com`,
	`font-src 'self' https://fonts.gstatic.com`,
	`connect-src 'self' https://*.supabase.co https://o*.ingest.sentry.io https://api.groq.com`,
	`frame-ancestors 'none'`,
	`base-uri 'self'`,
	`form-action 'self'`,
].join("; ");
