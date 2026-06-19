/**
 * SahelFlow Rate Limiter
 * Simple in-memory rate limiting for single-seller deployments.
 * Limits reset on cold starts, which is acceptable for Algerian COD e-commerce scale.
 *
 * TODO (Phase 5.3 — Scale): Replace with @upstash/ratelimit when upgrading to
 * multi-instance Vercel deployments. The current in-memory Map resets on cold
 * starts and is NOT shared across serverless instances.
 * Migration path: https://github.com/upstash/ratelimit
 * Pattern:
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *   const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, "1m") });
 */

import type { NextRequest } from "next/server";

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: number;
	provider: string;
}

/**
 S13 fix: Extract the client IP in a way that resists XFF spoofing.
 
 The old pattern (`x-forwarded-for`.split(",")[0]) took the FIRST IP in the
 chain, but that value is client-controllable. An attacker can rotate the
 first XFF IP to get fresh rate-limit buckets indefinitely.
 
 The new strategy (in priority order):
   1. `x-vercel-forwarded-for` - set by Vercel edge network to the verified
      client IP. NOT client-controllable. (Preferred on Vercel.)
   2. `x-real-ip` - set by many reverse proxies (nginx, fly.io, etc.) to the
      real connecting IP. Not client-controllable when the proxy overwrites it.
   3. The FULL `x-forwarded-for` chain (not just the first IP). If an attacker
      appends/rotates IPs, the whole string changes, producing a different key.
      This is less precise than (1)/(2) but better than trusting the first IP.
   4. "anonymous" - when no IP header is present at all.
 
 This is a best-effort mitigation for single-instance in-memory rate limiting.
 For multi-instance deployments, replace with @upstash/ratelimit (Redis-backed)
 which uses a stable server-side identity.
 */
export function getClientIP(req: Request | NextRequest): string {
	// Both Request and NextRequest have a .headers property (Headers object).
	// No need for instanceof — duck typing is safer across module boundaries.
	const headers = req.headers;

	// 1. Vercel verified client IP (preferred - not client-controllable)
	const vercelIP = headers.get("x-vercel-forwarded-for");
	if (vercelIP) {
		// x-vercel-forwarded-for may itself be a chain; take the first entry
		// since Vercel sets this to the real client IP (not spoofable).
		const ip = vercelIP.split(",")[0]?.trim();
		if (ip) return ip;
	}

	// 2. x-real-ip (common proxy-set header, often overwrites client value)
	const realIP = headers.get("x-real-ip");
	if (realIP) {
		const ip = realIP.trim();
		if (ip) return ip;
	}

	// 3. Full x-forwarded-for chain - NOT just the first IP.
	// Using the full chain means an attacker rotating IPs changes the key.
	const xff = headers.get("x-forwarded-for");
	if (xff) {
		const trimmed = xff.trim();
		if (trimmed) return trimmed;
	}

	// 4. Fallback
	return "anonymous";
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
