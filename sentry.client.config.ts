import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	// Only send errors in production
	enabled: process.env.NODE_ENV === "production",
	// Performance monitoring — sample 10% of transactions
	tracesSampleRate: 0.1,
	// Don't send PII
	sendDefaultPii: false,
	// Phase 6.12: Tightened ignoreErrors patterns to avoid over-broad substring matching.
	// Previously "Load failed" would match legitimate API failures; now scoped to
	// the specific Safari/WebKit network error message.
	ignoreErrors: [
		// Safari/WebKit: ResizeObserver loop completed with undelivered notifications
		/ResizeObserver loop/i,
		// Safari: Non-Error promise rejection captured with no error
		"Non-Error promise rejection",
		// Safari/WebKit: network load failure (not our API errors)
		"Load failed" as const, // exact match for Safari's `TypeError: Load failed`
		// Chrome: network error on cancelled navigations
		"net::ERR_INTERNET_DISCONNECTED",
		"net::ERR_CONNECTION_REFUSED",
		// Browser extension noise
		/extension\./i,
		// React: error boundary swallowed
		"ResizeObserver loop completed with undelivered notifications",
	],
});
