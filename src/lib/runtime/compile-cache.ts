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
 */
const RUNTIME_FLUSH_DELAYS_MS = [90_000, 10 * 60_000] as const;

export function schedulePackagedCompileCacheFlush(): void {
  if (!process.env.NODE_COMPILE_CACHE) return;
  for (const delay of RUNTIME_FLUSH_DELAYS_MS) {
    const timer = setTimeout(() => {
      flushPackagedCompileCache();
    }, delay);
    timer.unref?.();
  }
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
