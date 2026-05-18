/**
 * SahelFlow Rate Limiter
 * Simple in-memory rate limiting for single-seller deployments.
 * Limits reset on cold starts, which is acceptable for Algerian COD e-commerce scale.
 */

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: number;
	provider: string;
}

interface MemoryEntry {
	count: number;
	resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

if (typeof setInterval !== "undefined") {
	setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of memoryStore) {
			if (entry.resetAt < now) memoryStore.delete(key);
		}
	}, 300000);
}

export function rateLimit(
	key: string,
	maxRequests: number = 10,
	windowMs: number = 60000,
): RateLimitResult {
	const now = Date.now();
	const entry = memoryStore.get(key);

	// Hard cap: evict oldest entries if store grows too large (DDoS protection)
	const MAX_ENTRIES = 10000;
	if (memoryStore.size >= MAX_ENTRIES && !memoryStore.has(key)) {
		// Evict entries closest to expiry to make room
		const entries = Array.from(memoryStore.entries());
		entries.sort((a, b) => a[1].resetAt - b[1].resetAt);
		const toEvict = Math.ceil(MAX_ENTRIES * 0.2); // evict 20%
		for (let i = 0; i < toEvict; i++) {
			memoryStore.delete(entries[i][0]);
		}
	}

	if (!entry || entry.resetAt < now) {
		memoryStore.set(key, { count: 1, resetAt: now + windowMs });
		return {
			allowed: true,
			remaining: maxRequests - 1,
			resetAt: now + windowMs,
			provider: "memory",
		};
	}

	entry.count++;
	memoryStore.set(key, entry);

	const remaining = Math.max(0, maxRequests - entry.count);
	return {
		allowed: entry.count <= maxRequests,
		remaining,
		resetAt: entry.resetAt,
		provider: "memory",
	};
}

export function rateLimitHeaders(result: {
	remaining: number;
	resetAt: number;
	provider?: string;
}) {
	return {
		"X-RateLimit-Remaining": String(result.remaining),
		"X-RateLimit-Reset": String(result.resetAt),
		"X-RateLimit-Provider": "memory",
	};
}
