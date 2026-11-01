import { desktopRecoveryRetryDelayMs } from "@/lib/runtime/desktop-recovery";

/**
 * Watches whether the app's own local runtime answers, and says so plainly
 * when it does not.
 *
 * The desktop-resume recovery only wakes after a long clock gap. A runtime that
 * stops or restarts while the machine stays awake needs its own signal, and a
 * browser that reports "no network" is a different situation from a runtime
 * that does not answer, so the two are kept apart.
 *
 * This file has no DOM access: the browser adapters (probe, online flag,
 * visibility) are passed in, which keeps the timing testable with fake timers.
 */

export type RuntimeHealthStatus = "ok" | "reconnecting" | "offline";

export interface RuntimeHealthState {
  status: RuntimeHealthStatus;
  /** Failed probes in a row. */
  failures: number;
  /** A probe started by the seller (Retry) is running. */
  retrying: boolean;
}

/** While healthy, one cheap probe this often (only while the page is visible). */
export const RUNTIME_HEALTHY_PROBE_MS = 20_000;
/** A single failed probe is a blip; the banner needs this many in a row. */
export const RUNTIME_FAILURES_TO_SHOW = 2;
/** Once shown, the banner needs this many good probes in a row to leave. */
export const RUNTIME_SUCCESSES_TO_CLEAR = 2;
/** Probes right after a failure or while recovering. */
export const RUNTIME_RECOVERING_PROBE_MS = 2_000;

export interface RuntimeHealthMonitorOptions {
  /** Resolves true when the local runtime answered healthy. Must not reject for a failure; a rejection counts as one. */
  probe: () => Promise<boolean>;
  /** The browser's own network flag. */
  isOnline: () => boolean;
  /** False while the tab is hidden: no probes then. */
  isVisible: () => boolean;
  /** Runs once when a shown banner clears, so pages that failed meanwhile can reload. */
  onRecovered?: () => void;
}

export interface RuntimeHealthMonitor {
  start: () => void;
  stop: () => void;
  /** The seller pressed Retry: probe now, even if one is already scheduled. */
  retryNow: () => Promise<void>;
  /** Tab became visible again, or the browser went online/offline: probe now if idle. */
  environmentChanged: () => void;
  getState: () => RuntimeHealthState;
  subscribe: (listener: (state: RuntimeHealthState) => void) => () => void;
}

export function createRuntimeHealthMonitor(
  options: RuntimeHealthMonitorOptions,
): RuntimeHealthMonitor {
  let state: RuntimeHealthState = { status: "ok", failures: 0, retrying: false };
  let successes = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let running = false;
  const listeners = new Set<(next: RuntimeHealthState) => void>();

  const publish = (next: RuntimeHealthState) => {
    if (
      next.status === state.status &&
      next.failures === state.failures &&
      next.retrying === state.retrying
    ) {
      return;
    }
    state = next;
    for (const listener of Array.from(listeners)) listener(state);
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const nextDelayMs = (): number => {
    if (state.failures > 0) return desktopRecoveryRetryDelayMs(state.failures);
    if (state.status !== "ok") return RUNTIME_RECOVERING_PROBE_MS;
    return RUNTIME_HEALTHY_PROBE_MS;
  };

  const schedule = () => {
    clearTimer();
    if (!running) return;
    // A hidden tab stays quiet; environmentChanged() wakes it when it returns.
    if (!options.isVisible()) return;
    timer = setTimeout(() => {
      timer = null;
      void runProbe();
    }, nextDelayMs());
  };

  const settle = (healthy: boolean) => {
    if (healthy) {
      successes += 1;
      if (state.status === "ok") {
        // A blip followed by a good answer is forgotten.
        publish({ ...state, failures: 0 });
        return;
      }
      if (successes >= RUNTIME_SUCCESSES_TO_CLEAR) {
        publish({ status: "ok", failures: 0, retrying: state.retrying });
        options.onRecovered?.();
        return;
      }
      // Still shown: stay until the answer holds, so a flapping runtime does not flicker the banner.
      publish({ ...state, failures: 0 });
      return;
    }

    successes = 0;
    const failures = state.failures + 1;
    if (state.status === "ok" && failures < RUNTIME_FAILURES_TO_SHOW) {
      publish({ ...state, failures });
      return;
    }
    // Offline wording only when the browser itself says there is no network.
    publish({
      status: options.isOnline() ? "reconnecting" : "offline",
      failures,
      retrying: state.retrying,
    });
  };

  function runProbe(): Promise<void> {
    if (inFlight) return inFlight;
    clearTimer();
    const attempt = (async () => {
      let healthy = false;
      try {
        healthy = await options.probe();
      } catch {
        healthy = false;
      }
      if (!running) return;
      settle(healthy);
    })();
    inFlight = attempt.finally(() => {
      inFlight = null;
      if (state.retrying) publish({ ...state, retrying: false });
      schedule();
    });
    return inFlight;
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule();
    },
    stop() {
      running = false;
      clearTimer();
    },
    async retryNow() {
      if (!running) return;
      if (!inFlight) publish({ ...state, retrying: true });
      await runProbe();
    },
    environmentChanged() {
      if (!running || inFlight) return;
      if (!options.isVisible()) {
        clearTimer();
        return;
      }
      void runProbe();
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
