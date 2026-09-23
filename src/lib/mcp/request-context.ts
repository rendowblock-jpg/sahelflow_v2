/**
 * Rate limiting and client context — CodFlow convention (EX-5 §7).
 *
 * Per-subject fixed-window rate limiter (200 calls/60s, fail-open).
 * The MCP spec's security requirement: "servers MUST rate limit tool
 * invocations." Deliberately approximate and fail-open: the scope gate and
 * audit trail remain the security boundary; this guard only stops sustained
 * flooding.
 *
 * Client hints (`openai/subject`, `openai/session`) are correlation-only,
 * never authorization-relevant. Authorization remains the permission model.
 */

/** Rolling window length and per-subject call budget. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_CALLS = 200;

export interface ClientMeta {
  subject?: string;
  session?: string;
}

/**
 * Read client-supplied per-request hints from `_meta`.
 * Absent/invalid values yield `{}`.
 */
export function readClientMeta(ctx: unknown): ClientMeta {
  const meta = (ctx as { _meta?: Record<string, unknown> } | undefined)?._meta;
  if (!meta) return {};
  const subject =
    typeof meta["openai/subject"] === "string" ? meta["openai/subject"] : undefined;
  const session =
    typeof meta["openai/session"] === "string" ? meta["openai/session"] : undefined;
  return {
    ...(subject !== undefined ? { subject } : {}),
    ...(session !== undefined ? { session } : {}),
  };
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

// In-memory rate limit store (local-first: no KV dependency)
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

/**
 * Fixed-window counter. Fail-open by design: errors allow the call —
 * the scope gate and audit trail remain the security boundary.
 */
export function checkRateLimit(subject: string): RateLimitResult {
  const nowMs = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
  const windowIndex = Math.floor(nowMs / windowMs);
  const key = `${subject}:${windowIndex}`;

  try {
    const entry = rateLimitStore.get(key);
    const nowWindowStart = windowIndex * windowMs;

    // Clean up old windows periodically
    if (rateLimitStore.size > 1000) {
      for (const [k, v] of rateLimitStore) {
        if (v.windowStart < nowWindowStart - windowMs * 2) {
          rateLimitStore.delete(k);
        }
      }
    }

    const count = entry?.count ?? 0;
    if (count >= RATE_LIMIT_MAX_CALLS) {
      const elapsedInWindow = nowMs - nowWindowStart;
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((windowMs - elapsedInWindow) / 1000),
      };
    }

    rateLimitStore.set(key, { count: count + 1, windowStart: nowWindowStart });
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Audit redaction — CodFlow convention. Caps string values at 1024 chars
 * and nesting depth at 8. Shape preserved so the audit trail stays readable.
 */
const MAX_AUDIT_STRING_LENGTH = 1024;
const MAX_AUDIT_DEPTH = 8;

export function redactForAudit(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_AUDIT_STRING_LENGTH
      ? `<${value.length} chars elided>`
      : value;
  }
  if (depth >= MAX_AUDIT_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => redactForAudit(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactForAudit(v, depth + 1)]),
    );
  }
  return value;
}

/**
 * Audit log entry for one MCP tool call.
 * CodFlow writes `mcp.tool_called` activity rows; we log structured entries.
 */
export interface McpAuditEntry {
  timestamp: string;
  tool: string;
  actor: string;
  ok: boolean;
  args: unknown;
  error?: string;
  clientSubject?: string;
  clientSession?: string;
  durationMs?: number;
}

const auditLog: McpAuditEntry[] = [];
const MAX_AUDIT_LOG_SIZE = 10_000;

export function logToolCall(entry: McpAuditEntry): void {
  auditLog.push(entry);
  // Bounded ring buffer
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_LOG_SIZE);
  }
}

export function getAuditLog(limit = 100): McpAuditEntry[] {
  return auditLog.slice(-limit);
}
