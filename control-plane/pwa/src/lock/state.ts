// App lock as a pure state machine; the caller passes the clock.
export const PIN_LENGTH = 8;
export const MAX_TRIES = 5;
export const WAIT_MS = 30_000;
export const LOCK_AFTER_MS = 5 * 60_000;

export type LockState =
  | Readonly<{ phase: "unset" }>
  | Readonly<{ phase: "locked"; failures: number; waitUntil: number }>
  | Readonly<{ phase: "unlocked"; hiddenAt: number | null }>;
export type LockRecordState = Readonly<{ failures: number; waitUntil: number }>;

export function isValidPin(pin: string): boolean {
  return typeof pin === "string" && /^[0-9]{8}$/.test(pin);
}
export function initialState(hasPin: boolean, record: LockRecordState | null): LockState {
  if (!hasPin) return { phase: "unset" };
  return { phase: "locked", failures: record?.failures ?? 0, waitUntil: record?.waitUntil ?? 0 };
}
export function attemptStatus(state: LockState, now: number): Readonly<{ allowed: boolean; waitSeconds: number; triesLeft: number }> {
  if (state.phase !== "locked") return { allowed: false, waitSeconds: 0, triesLeft: 0 };
  if (now < state.waitUntil) return { allowed: false, waitSeconds: Math.ceil((state.waitUntil - now) / 1000), triesLeft: MAX_TRIES - state.failures };
  return { allowed: true, waitSeconds: 0, triesLeft: MAX_TRIES - state.failures };
}
export function afterAttempt(state: LockState, ok: boolean, now: number): LockState {
  if (state.phase !== "locked" || now < state.waitUntil) return state;
  if (ok) return { phase: "unlocked", hiddenAt: null };
  const failures = state.failures + 1;
  return failures >= MAX_TRIES ? { phase: "locked", failures: 0, waitUntil: now + WAIT_MS } : { phase: "locked", failures, waitUntil: 0 };
}
export function onHidden(state: LockState, now: number): LockState {
  if (state.phase !== "unlocked" || state.hiddenAt !== null) return state;
  return { phase: "unlocked", hiddenAt: now };
}
export function onVisible(state: LockState, now: number): LockState {
  if (state.phase !== "unlocked" || state.hiddenAt === null) return state;
  // A clock that moved backwards cannot prove the time was short: lock.
  if (now < state.hiddenAt || now - state.hiddenAt >= LOCK_AFTER_MS) return { phase: "locked", failures: 0, waitUntil: 0 };
  return { phase: "unlocked", hiddenAt: null };
}
