import "server-only";

/**
 * Storefront OTP — send guards (cost control) (FD-061 EX-4, slice 6).
 *
 * Contract transcribed from the live-proven CodFlow engine
 * (cod-server/src/endpoints/store-otp/guards.ts @ 00f18fa, Apache-2.0),
 * re-expressed with an in-process window map because the desktop runtime
 * has no KV namespace:
 *
 * Cooldowns that stop runaway sends BEFORE they cost the merchant money.
 * Best-effort by contract: a guard-bookkeeping failure is swallowed and
 * the send proceeds — dzverify's own limits (5/recipient/hour,
 * 200/account/hour) remain the hard bound. The in-process map is
 * eventually consistent across restarts, which is acceptable for cost
 * control, not for security (the HMAC token is the security boundary).
 *
 * Interface: check returns the first tripped guard or null; record marks a
 * completed send. Both swallow their own failures.
 */

const PHONE_COOLDOWN_MS = 60_000;
const IP_HOURLY_LIMIT = 20;
const IP_WINDOW_MS = 3_600_000;

export interface TrippedGuard {
  reason: "phone_cooldown" | "ip_hourly";
  windowSeconds: number;
}

interface GuardState {
  phones: Map<string, number>;
  ips: Map<string, { count: number; resetAt: number }>;
}

const globalForGuards = globalThis as unknown as {
  __sahelflowOtpGuards?: GuardState;
};

function guardState(): GuardState {
  if (!globalForGuards.__sahelflowOtpGuards) {
    globalForGuards.__sahelflowOtpGuards = { phones: new Map(), ips: new Map() };
  }
  return globalForGuards.__sahelflowOtpGuards;
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const state = guardState();
    for (const [phone, until] of state.phones) {
      if (now > until) state.phones.delete(phone);
    }
    for (const [ip, entry] of state.ips) {
      if (now > entry.resetAt) state.ips.delete(ip);
    }
  }, 300_000).unref?.();
}

export function createOtpSendGuards(nowMs: number = Date.now()) {
  return {
    /**
     * Returns the first tripped guard, or null. A bookkeeping failure
     * never blocks the send (fail-open by contract — cost control only).
     */
    async check(storefrontSlug: string, phone: string, ip: string | null): Promise<TrippedGuard | null> {
      try {
        const state = guardState();
        const until = state.phones.get(`${storefrontSlug}:${phone}`);
        if (until !== undefined && nowMs < until) {
          return {
            reason: "phone_cooldown",
            windowSeconds: Math.ceil((until - nowMs) / 1000),
          };
        }

        if (ip) {
          const entry = state.ips.get(`${storefrontSlug}:${ip}`);
          if (entry && nowMs <= entry.resetAt && entry.count >= IP_HOURLY_LIMIT) {
            return {
              reason: "ip_hourly",
              windowSeconds: Math.ceil((entry.resetAt - nowMs) / 1000),
            };
          }
        }
        return null;
      } catch {
        return null;
      }
    },

    /**
     * Record a completed send: set the phone cooldown and bump the IP
     * counter. Fire-and-forget safe — errors are swallowed by contract.
     */
    async record(storefrontSlug: string, phone: string, ip: string | null): Promise<void> {
      try {
        const state = guardState();
        state.phones.set(`${storefrontSlug}:${phone}`, nowMs + PHONE_COOLDOWN_MS);
        if (ip) {
          const key = `${storefrontSlug}:${ip}`;
          const entry = state.ips.get(key);
          if (!entry || nowMs > entry.resetAt) {
            state.ips.set(key, { count: 1, resetAt: nowMs + IP_WINDOW_MS });
          } else {
            entry.count += 1;
          }
        }
      } catch {
        // Cost-control bookkeeping only — never block the send path.
      }
    },
  };
}
