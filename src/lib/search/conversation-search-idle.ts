/**
 * The idle gate of the conversation-search indexer (PB-CONV-SEARCH-LOAD, slice 3).
 *
 * The index is built by one small step at a time, and only while the app has nothing else to do:
 *  - never at start-up: the gate is armed by the first request to /api/conversations or /api/conversations/search,
 *    and its first tick comes 60 s later, so the first launch pays nothing;
 *  - a tick runs only when no request is in flight and the last one ended at least 3 s ago, otherwise it waits;
 *  - ONE step per tick, then a pause of at least 250 ms; a busy database backs off (1 s, 2 s, 4 s ... up to 30 s);
 *  - when a step finds nothing to do, or fails 5 times in a row, the loop ends and no timer stays behind. The next
 *    inbox request arms it again (15 s later).
 *
 * withErrorHandler feeds noteRequestStart / noteRequestEnd. They are two integer updates on a shared object: no
 * allocation, no await, and they never throw. The state lives on globalThis because Next.js can load this file once
 * per route bundle, and a counter per copy would miss requests.
 *
 * This file imports nothing heavy on purpose (every route imports withErrorHandler). The default step is loaded on the
 * first tick.
 */

export type IdleStepResult = { changed: boolean };

export type IdleGateOptions = {
  /** One unit of work. `changed: false` = nothing left to do. */
  runStep?: () => Promise<IdleStepResult>;
  now?: () => number;
  armDelayMs?: number;
  rearmDelayMs?: number;
  quietMs?: number;
  pauseMs?: number;
  firstBackoffMs?: number;
  maxBackoffMs?: number;
  maxFailures?: number;
  /** false = arm() does nothing (used for the shared gate under test). */
  enabled?: boolean;
};

export type IdleGate = {
  inFlight: number;
  lastEndedAt: number;
  requestStarted(pathname: string | undefined): void;
  requestEnded(): void;
  arm(): void;
};

export function isBusyError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P1008" || code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|socket timeout/iu.test(message);
}

function isInboxPath(pathname: string | undefined): boolean {
  return pathname === "/api/conversations" || pathname === "/api/conversations/search";
}

async function defaultRunStep(): Promise<IdleStepResult> {
  const { runConversationSearchIndexTick } = await import("@/lib/search/conversation-search-runtime");
  return runConversationSearchIndexTick();
}

export function createConversationSearchIdleGate(options: IdleGateOptions = {}): IdleGate {
  const runStep = options.runStep ?? defaultRunStep;
  const now = options.now ?? Date.now;
  const armDelayMs = options.armDelayMs ?? 60_000;
  const rearmDelayMs = options.rearmDelayMs ?? 15_000;
  const quietMs = options.quietMs ?? 3_000;
  const pauseMs = options.pauseMs ?? 250;
  const firstBackoffMs = options.firstBackoffMs ?? 1_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const maxFailures = options.maxFailures ?? 5;
  const enabled = options.enabled ?? true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stepRunning = false;
  let armedBefore = false;
  let failures = 0;
  let backoffMs = 0;

  function schedule(delayMs: number): void {
    timer = setTimeout(() => void tick(), delayMs);
    // The index must never keep the process alive.
    (timer as { unref?: () => void }).unref?.();
  }

  async function tick(): Promise<void> {
    timer = null;
    if (gate.inFlight > 0) {
      schedule(quietMs);
      return;
    }
    const quietFor = now() - gate.lastEndedAt;
    if (quietFor < quietMs) {
      schedule(Math.max(1, quietMs - quietFor));
      return;
    }
    let next: number | null = null;
    stepRunning = true;
    try {
      const outcome = await runStep();
      failures = 0;
      backoffMs = 0;
      next = outcome.changed ? pauseMs : null;
    } catch (error) {
      failures += 1;
      backoffMs = Math.min(maxBackoffMs, backoffMs === 0 ? firstBackoffMs : backoffMs * 2);
      // A busy database is retried later without limit; any other failure ends the loop after a few tries.
      next = isBusyError(error) || failures < maxFailures ? backoffMs : null;
    } finally {
      stepRunning = false;
    }
    if (next !== null) schedule(next);
  }

  const gate: IdleGate = {
    inFlight: 0,
    lastEndedAt: Number.NEGATIVE_INFINITY,
    requestStarted(pathname) {
      gate.inFlight += 1;
      if (isInboxPath(pathname)) gate.arm();
    },
    requestEnded() {
      if (gate.inFlight > 0) gate.inFlight -= 1;
      gate.lastEndedAt = now();
    },
    arm() {
      if (!enabled || timer !== null || stepRunning) return;
      schedule(armedBefore ? rearmDelayMs : armDelayMs);
      armedBefore = true;
    },
  };
  return gate;
}

const GATE_KEY = Symbol.for("sahelflow.conversation-search-idle-gate");

function sharedGate(): IdleGate {
  const holder = globalThis as unknown as Record<symbol, IdleGate | undefined>;
  return (holder[GATE_KEY] ??= createConversationSearchIdleGate({
    enabled: process.env.NODE_ENV !== "test",
  }));
}

/** Called by withErrorHandler when a request begins. Cheap and exception-safe. */
export function noteRequestStart(pathname: string | undefined): void {
  try {
    sharedGate().requestStarted(pathname);
  } catch {
    // The gate is an optimisation: a request must never fail because of it.
  }
}

/** Called by withErrorHandler when a request ends (also when it throws). */
export function noteRequestEnd(): void {
  try {
    sharedGate().requestEnded();
  } catch {
    // see noteRequestStart
  }
}

export function conversationSearchIdleState(): { inFlight: number; lastEndedAt: number } {
  const { inFlight, lastEndedAt } = sharedGate();
  return { inFlight, lastEndedAt };
}
