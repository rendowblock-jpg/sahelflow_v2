import "server-only";

type CompileCacheProcess = NodeJS.Process & {
  getBuiltinModule?: (specifier: string) => unknown;
};

type CompileCacheModule = {
  flushCompileCache?: () => void;
};

type EventLoopUtilization = {
  idle: number;
  active: number;
  utilization: number;
};

type PerfHooksModule = {
  performance?: {
    eventLoopUtilization?: (
      utilization1?: EventLoopUtilization,
      utilization2?: EventLoopUtilization,
    ) => EventLoopUtilization;
  };
};

type TimerHandle = { unref?: () => unknown };

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
export const RUNTIME_FLUSH_DELAYS_MS = [90_000, 10 * 60_000] as const;

/**
 * F-0014. Node's module.flushCompileCache() is synchronous. Measured in a
 * Windows lab (datacenter runner, fresh install, cold cache): the flush did
 * about 1,330-1,440 write operations in a 1.4-2.8 s stretch (7 probes) and held
 * up the worst request for 1.5-6.7 s, so a click that landed in that window
 * waited that long. With the periodic flush removed the worst request was
 * 0.13-0.16 s (2 probes). The flush is kept, because it is what
 * protects the cache when the app is not closed normally, but it now waits for
 * a quiet event loop: it runs once the loop has been below QUIET_FLUSH_DEFAULTS
 * .quietThreshold for quietWindowsRequired windows in a row, and at the latest
 * maxWaitMs after its timer fired, so persistence is never lost. This lowers
 * the chance that the pause lands on a click. It does not remove the pause.
 * The shutdown flush is a separate call and is unchanged.
 */
export const QUIET_FLUSH_DEFAULTS = {
  /** Length of one utilization window, and the re-check period. */
  windowMs: 1000,
  /** A window is quiet when event loop utilization is strictly below this. */
  quietThreshold: 0.1,
  /** Consecutive quiet windows needed before the flush runs. */
  quietWindowsRequired: 3,
  /** Latest time to wait, counted from the moment the timer fired. */
  maxWaitMs: 5 * 60_000,
} as const;

export type QuietFlushOptions = {
  /** What to run when the loop is quiet. Default: flushPackagedCompileCache. */
  flush?: () => unknown;
  /** Monotonic milliseconds. Default: performance.now(). */
  now?: () => number;
  /** Scheduler. Default: setTimeout. Each returned handle is unref'd. */
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle | undefined;
  /**
   * Event loop utilization (0..1) since the previous call. Default: a sampler
   * on node:perf_hooks. `null` means "cannot be measured": flush at once, as
   * the periodic flush did before F-0014.
   */
  sampleUtilization?: (() => number) | null;
  windowMs?: number;
  quietThreshold?: number;
  quietWindowsRequired?: number;
  maxWaitMs?: number;
};

/**
 * Event loop utilization over the window since the previous call (not since
 * process start). Returns null when Node does not offer it.
 */
export function createEventLoopUtilizationSampler(): (() => number) | null {
  try {
    const perfHooks = (process as CompileCacheProcess).getBuiltinModule?.(
      "node:perf_hooks",
    ) as PerfHooksModule | undefined;
    const performanceApi = perfHooks?.performance;
    if (typeof performanceApi?.eventLoopUtilization !== "function") return null;
    const read = performanceApi.eventLoopUtilization.bind(performanceApi);
    let previous = read();
    return () => {
      const current = read();
      const delta = read(current, previous);
      previous = current;
      return delta.utilization;
    };
  } catch {
    return null;
  }
}

/**
 * Runs `flush` once, when the event loop has been quiet for long enough, or
 * when maxWaitMs has passed. Never throws; every timer it creates is unref'd,
 * so waiting never keeps the process alive.
 */
export function flushWhenLoopQuiet(options: QuietFlushOptions = {}): void {
  const windowMs = options.windowMs ?? QUIET_FLUSH_DEFAULTS.windowMs;
  const quietThreshold =
    options.quietThreshold ?? QUIET_FLUSH_DEFAULTS.quietThreshold;
  const quietWindowsRequired =
    options.quietWindowsRequired ?? QUIET_FLUSH_DEFAULTS.quietWindowsRequired;
  const maxWaitMs = options.maxWaitMs ?? QUIET_FLUSH_DEFAULTS.maxWaitMs;
  const flush = options.flush ?? flushPackagedCompileCache;
  const now = options.now ?? (() => performance.now());
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const sample =
    options.sampleUtilization === undefined
      ? createEventLoopUtilizationSampler()
      : options.sampleUtilization;

  let done = false;
  const flushOnce = () => {
    if (done) return;
    done = true;
    try {
      flush();
    } catch {
      // The cache is an optimisation; a failed flush must never surface.
    }
  };

  if (!sample) {
    flushOnce();
    return;
  }

  const startedAt = now();
  let quietWindows = 0;

  const schedule = () => {
    try {
      setTimer(check, windowMs)?.unref?.();
    } catch {
      flushOnce();
    }
  };

  const check = () => {
    if (done) return;
    let utilization: number;
    try {
      utilization = sample();
    } catch {
      flushOnce();
      return;
    }
    // A sample that is not a number says nothing: count it as busy.
    quietWindows =
      Number.isFinite(utilization) && utilization < quietThreshold
        ? quietWindows + 1
        : 0;
    if (quietWindows >= quietWindowsRequired || now() - startedAt >= maxWaitMs) {
      flushOnce();
      return;
    }
    schedule();
  };

  schedule();
}

export function schedulePackagedCompileCacheFlush(
  options: QuietFlushOptions = {},
): void {
  if (!process.env.NODE_COMPILE_CACHE) return;
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  for (const delay of RUNTIME_FLUSH_DELAYS_MS) {
    try {
      const timer = setTimer(() => {
        flushWhenLoopQuiet({ ...options, setTimer });
      }, delay);
      timer?.unref?.();
    } catch {
      // Scheduling is best-effort; the shutdown flush still persists the cache.
    }
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
