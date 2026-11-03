/**
 * Rate limit for the app log (F-0033). A slow PC must not pay for logging, so
 * the file gets at most 30 lines per minute in total and at most 5 per minute
 * per distinct msg. The line over a limit is dropped and counted; the first
 * line of the next minute is preceded by ONE `log.suppressed` summary (the
 * caller writes it; the summary line itself uses one slot of the new minute, so
 * a minute never holds more than 30 lines). The clock is injectable.
 *
 * Windows start at the first line after the previous window ended (no timer),
 * and a clock that moves backwards simply starts a new window.
 */

export interface LogRateLimiterOptions {
  now?: () => number;
  maxPerWindow?: number;
  maxPerMsg?: number;
  windowMs?: number;
}

export interface LogRateVerdict {
  /** Write this line. */
  write: boolean;
  /** When above 0, write a `log.suppressed` line with this count BEFORE this one. */
  summaryCount: number;
}

export interface LogRateLimiter {
  admit(msg: string): LogRateVerdict;
}

const MSG_KEY_MAX = 200;

export function createLogRateLimiter(options: LogRateLimiterOptions = {}): LogRateLimiter {
  const now = options.now ?? Date.now;
  const maxPerWindow = options.maxPerWindow ?? 30;
  const maxPerMsg = options.maxPerMsg ?? 5;
  const windowMs = options.windowMs ?? 60_000;

  let windowStart: number | null = null;
  let total = 0;
  let dropped = 0;
  // Only ADMITTED msgs are stored, so this holds at most maxPerWindow keys.
  const perMsg = new Map<string, number>();

  return {
    admit(msg) {
      const at = now();
      let summaryCount = 0;
      if (windowStart === null || at - windowStart >= windowMs || at < windowStart) {
        summaryCount = dropped;
        windowStart = at;
        total = summaryCount > 0 ? 1 : 0;
        dropped = 0;
        perMsg.clear();
      }
      const key = msg.length > MSG_KEY_MAX ? msg.slice(0, MSG_KEY_MAX) : msg;
      const used = perMsg.get(key) ?? 0;
      if (total >= maxPerWindow || used >= maxPerMsg) {
        dropped += 1;
        return { write: false, summaryCount };
      }
      total += 1;
      perMsg.set(key, used + 1);
      return { write: true, summaryCount };
    },
  };
}
