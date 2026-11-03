import "server-only";

type CompileCacheProcess = NodeJS.Process & {
  getBuiltinModule?: (specifier: string) => unknown;
};

type CompileCacheModule = {
  flushCompileCache?: () => void;
};

/**
 * Persist Node's built-in module compile cache during authenticated desktop
 * shutdown.
 *
 * The desktop terminates the contained Node process tree on close, so relying on
 * normal process exit can lose the cache accumulated during startup. This helper
 * must never run in runtime or UI readiness: cache persistence may improve later
 * launches but can never decide, delay, or temporarily freeze application
 * readiness.
 */
/**
 * Also persist the cache while the app is running, after the workspace and the
 * seller's first pages have loaded. Relying on the close-time flush alone left
 * every launch cold whenever the app was not closed normally (Windows shutdown,
 * sleep, crash). Founder evidence: the last recorded flush was Internal.37 on
 * 2026-09-16, so Internal.39 started without a cache and took 27.5 s to reach
 * a ready workspace on a low-end laptop. The writes happen well after
 * readiness, on unref'd timers, and never block shutdown.
 *
 * Finding F-0014: `flushCompileCache()` is synchronous and writes every entry
 * added since the previous flush. One flush at 90 s wrote ~1,400 files (3.4 MB)
 * in one burst in a Windows lab and held the slowest request for 1.75 s and
 * 6.73 s. Waiting for a quiet event loop first only moved the same burst later.
 * So the flush now runs often: each one writes only what is new since the last
 * one (an empty flush costs ~0 ms), and no single flush has to write the whole
 * cache. The call time is the UI-ready signal (or the 45 s start fallback, see
 * instrumentation.ts), so the first flush is at least 10 s after readiness.
 *
 * The schedule, counted from the call of `schedulePackagedCompileCacheFlush()`:
 * the first flush at 10 s, then every 5 s up to 2 min, then every 30 s up to
 * 10 min (the last flush, as before). That is 39 flushes. One chained timer:
 * each wait starts when the previous flush has finished, so a slow disk never
 * makes flushes pile up or run back to back.
 */
export const COMPILE_CACHE_FIRST_FLUSH_MS = 10_000;
export const COMPILE_CACHE_FAST_INTERVAL_MS = 5_000;
export const COMPILE_CACHE_FAST_UNTIL_MS = 2 * 60_000;
export const COMPILE_CACHE_SLOW_INTERVAL_MS = 30_000;
export const COMPILE_CACHE_LAST_FLUSH_MS = 10 * 60_000;

type TimerHandle = { unref?: () => unknown };

export interface CompileCacheScheduleOptions {
  /** What to run at each step. Defaults to `flushPackagedCompileCache`. */
  flush?: () => unknown;
  /** How to wait. Defaults to `setTimeout`. Tests pass a fake. */
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
}

/** Offset of the flush that follows a flush made at `afterMs`, or null after the last one. */
function nextFlushOffsetMs(afterMs: number): number | null {
  const step =
    afterMs < COMPILE_CACHE_FAST_UNTIL_MS
      ? COMPILE_CACHE_FAST_INTERVAL_MS
      : COMPILE_CACHE_SLOW_INTERVAL_MS;
  const next = afterMs + step;
  return next <= COMPILE_CACHE_LAST_FLUSH_MS ? next : null;
}

export function schedulePackagedCompileCacheFlush(
  options: CompileCacheScheduleOptions = {},
): void {
  if (!process.env.NODE_COMPILE_CACHE) return;
  const flush = options.flush ?? flushPackagedCompileCache;
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));

  const arm = (offsetMs: number, waitMs: number): void => {
    try {
      const timer = setTimer(() => {
        try {
          flush();
        } catch {
          // Persisting the cache is best effort and must not stop the chain.
        }
        const next = nextFlushOffsetMs(offsetMs);
        if (next !== null) arm(next, next - offsetMs);
      }, waitMs);
      timer.unref?.();
    } catch {
      // No timer, no more flushes: the shutdown flush still applies.
    }
  };

  arm(COMPILE_CACHE_FIRST_FLUSH_MS, COMPILE_CACHE_FIRST_FLUSH_MS);
}

export function flushPackagedCompileCache(): boolean {
  if (!process.env.NODE_COMPILE_CACHE) return false;

  try {
    const moduleApi = (process as CompileCacheProcess).getBuiltinModule?.(
      "node:module",
    ) as CompileCacheModule | undefined;
    if (!moduleApi?.flushCompileCache) return false;
    moduleApi.flushCompileCache();
    return true;
  } catch {
    return false;
  }
}
