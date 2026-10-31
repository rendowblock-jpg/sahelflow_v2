import type { ProjectionKind } from "../../../../src/lib/connected-platform/contracts";
import type { ScreenId } from "../views/view";

export const DAILY_CAP = 600;
export const MAX_DELAY_MS = 300_000;
export const STATUS_MAX_MS = 600_000;
// A tick on a screen with nothing to fetch re-arms this plain re-check (no request), so the polling chain never ends.
export const RECHECK_MS = 60_000;
export type Budget = Readonly<{ day: string; count: number }>;

// While visible: Orders and Inbox every 30 s, Settings, Today and the lock screen every 60 s (a locked phone still learns that the PC removed it); the pairing screens never.
const EVERY: Partial<Record<ScreenId, number>> = { orders: 30_000, order: 30_000, inbox: 30_000, conversation: 30_000, settings: 60_000, devices: 60_000, today: 60_000, lock: 60_000 };
export const intervalFor = (screen: ScreenId): number | null => EVERY[screen] ?? null;
// One fetch per kind per cycle, and only the kinds the visible screen shows.
const KINDS: Partial<Record<ScreenId, readonly ProjectionKind[]>> = { today: ["dashboard"], orders: ["orders"], order: ["orders"], inbox: ["conversations"], conversation: ["conversations"], settings: ["dashboard"], devices: ["dashboard"], lock: ["dashboard"] };
export const kindsFor = (screen: ScreenId): readonly ProjectionKind[] => KINDS[screen] ?? [];

// A 304, a network error or a 5xx doubles the wait up to 5 minutes; a success resets it; Retry-After can only lengthen it.
export function nextDelay(base: number, failures: number, retryAfterMs?: number): number {
  const doubled = Math.min(base * 2 ** Math.min(failures, 10), MAX_DELAY_MS);
  return retryAfterMs !== undefined ? Math.max(doubled, retryAfterMs) : doubled;
}
const STATUS_STEPS = [2000, 4000, 8000, 15_000];
export const statusDelay = (attempt: number): number => STATUS_STEPS[attempt] ?? 30_000;

export const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
// Hard cap on background requests per UTC day, kept in settings so a restart does not reset it.
export function spend(budget: Budget | null, now: number, cap: number = DAILY_CAP): Readonly<{ allowed: boolean; budget: Budget }> {
  const day = dayKey(now); const used = budget && budget.day === day ? budget.count : 0;
  return used >= cap ? { allowed: false, budget: { day, count: used } } : { allowed: true, budget: { day, count: used + 1 } };
}
