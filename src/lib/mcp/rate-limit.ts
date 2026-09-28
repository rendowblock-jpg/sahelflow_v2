/**
 * MCP invocation rate limiting (FD-063).
 *
 * CodFlow parity: a fixed window of 200 calls per 60 seconds per subject,
 * deliberately **fail-open**. The limiter exists to stop an agent loop from
 * hammering the local database, not to enforce authority. Authority is the
 * permission check and the proposal gate, neither of which this module can
 * weaken. A limiter fault must therefore never deny legitimate work.
 *
 * In-process and per-window, exactly like `src/lib/ai/rate-limit.ts`. The
 * desktop runs one Next.js process per shop, so a shared store is unnecessary.
 */
import "server-only";

import {
  MCP_RATE_LIMIT_MAX_CALLS,
  MCP_RATE_LIMIT_WINDOW_MS,
} from "./contracts";

interface Window {
  windowStartedAt: number;
  count: number;
}

const windows = new Map<string, Window>();

export interface McpRateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** True when the limiter itself failed and the call was allowed through. */
  failedOpen: boolean;
}

function prune(now: number): void {
  if (windows.size < 512) return;
  for (const [subject, window] of windows) {
    if (now - window.windowStartedAt > MCP_RATE_LIMIT_WINDOW_MS * 2) {
      windows.delete(subject);
    }
  }
}

/**
 * Consume one unit for `subject`. Never throws: a limiter fault fails open.
 */
export function consumeMcpRateLimit(subject: string): McpRateLimitDecision {
  const now = Date.now();
  try {
    prune(now);
    const existing = windows.get(subject);
    if (!existing || now - existing.windowStartedAt >= MCP_RATE_LIMIT_WINDOW_MS) {
      windows.set(subject, { windowStartedAt: now, count: 1 });
      return {
        allowed: true,
        remaining: MCP_RATE_LIMIT_MAX_CALLS - 1,
        resetAt: now + MCP_RATE_LIMIT_WINDOW_MS,
        failedOpen: false,
      };
    }
    const resetAt = existing.windowStartedAt + MCP_RATE_LIMIT_WINDOW_MS;
    if (existing.count >= MCP_RATE_LIMIT_MAX_CALLS) {
      return { allowed: false, remaining: 0, resetAt, failedOpen: false };
    }
    existing.count += 1;
    return {
      allowed: true,
      remaining: MCP_RATE_LIMIT_MAX_CALLS - existing.count,
      resetAt,
      failedOpen: false,
    };
  } catch {
    return {
      allowed: true,
      remaining: MCP_RATE_LIMIT_MAX_CALLS,
      resetAt: now + MCP_RATE_LIMIT_WINDOW_MS,
      failedOpen: true,
    };
  }
}

/** Test-only: drop every window. */
export function resetMcpRateLimit(): void {
  windows.clear();
}
