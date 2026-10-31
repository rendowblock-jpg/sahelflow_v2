import type { ProjectionKind } from "../../../../src/lib/connected-platform/contracts";
import type { RelayPoll } from "../today/relay-source";
import type { ScreenId } from "../views/view";
import { intervalFor, kindsFor, nextDelay, RECHECK_MS, spend, statusDelay, STATUS_MAX_MS, type Budget } from "./schedule";

export type Timers = Readonly<{ set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }>;
export type SyncDeps = Readonly<{
  now(): number; visible(): boolean; online(): boolean; screen(): ScreenId;
  fetchKind(kind: ProjectionKind): Promise<RelayPoll>;
  // The outbox status poll: true while a command is still open.
  pollCommands(): Promise<boolean>;
  loadBudget(): Promise<Budget | null>; saveBudget(budget: Budget): Promise<void>;
  onPoll(poll: RelayPoll, kind: ProjectionKind): void;
  timers: Timers;
}>;

export function createSync(d: SyncDeps) {
  let handle: unknown = null; let statusHandle: unknown = null; let failures = 0; let stopped = true; let statusUntil = 0; let statusAttempt = 0;
  const clearTimer = (): void => { if (handle !== null) { d.timers.clear(handle); handle = null; } };
  const arm = (ms: number): void => { clearTimer(); if (stopped) return; handle = d.timers.set(() => { handle = null; void cycle(false); }, ms); };
  async function allowed(manual: boolean): Promise<boolean> {
    if (manual) return true; // the Refresh button always works
    const next = spend(await d.loadBudget().catch(() => null), d.now());
    if (!next.allowed) return false;
    await d.saveBudget(next.budget).catch(() => undefined);
    return true;
  }
  async function cycle(manual: boolean): Promise<void> {
    if (stopped && !manual) return;
    const screen = d.screen(); const base = intervalFor(screen); const kinds = kindsFor(screen);
    if (base === null || kinds.length === 0) { if (!manual) arm(RECHECK_MS); return; } // nothing to fetch here: keep the chain alive, the next tick may be on a polling screen
    if (!manual && (!d.visible() || !d.online())) return; // nothing while hidden or offline; coming back fetches at once
    let good = false; let bad = false; let retry: number | undefined;
    for (const kind of kinds) {
      if (!(await allowed(manual))) return; // cap reached: no more background requests today
      const poll = await d.fetchKind(kind).catch((): RelayPoll => ({ kind: "network" }));
      d.onPoll(poll, kind);
      if (poll.kind === "revoked") { stop(); return; }
      if (poll.kind === "updated" || poll.kind === "stored") good = true; else bad = true;
      if (poll.kind === "rate_limited") retry = poll.retryAfterMs;
    }
    failures = good && !bad ? 0 : failures + 1;
    arm(nextDelay(base, failures, retry));
  }
  function stop(): void {
    stopped = true; clearTimer();
    if (statusHandle !== null) { d.timers.clear(statusHandle); statusHandle = null; }
  }
  function armStatus(): void {
    if (statusHandle !== null) d.timers.clear(statusHandle);
    statusHandle = d.timers.set(() => { statusHandle = null; void statusTick(); }, statusDelay(statusAttempt));
  }
  async function statusTick(): Promise<void> {
    if (d.now() > statusUntil || !d.visible() || !d.online()) return;
    if (!(await allowed(false))) return;
    const open = await d.pollCommands().catch(() => true);
    statusAttempt += 1;
    if (open) armStatus();
  }
  const now = (): void => { if (!stopped) { clearTimer(); void cycle(false); } if (statusUntil > d.now() && statusHandle === null) armStatus(); };
  return {
    start(immediate = true): void {
      stopped = false; failures = 0;
      if (immediate) { clearTimer(); void cycle(false); return; }
      arm(intervalFor(d.screen()) ?? RECHECK_MS); // a screen with no interval still gets the plain re-check, so the chain is alive when the screen changes
    },
    stop, onVisible: now, onOnline: now, onScreen: now,
    onHidden(): void { clearTimer(); },
    async refresh(): Promise<void> { failures = 0; await cycle(true); },
    // After the phone sends a command: status polls at 2, 4, 8, 15 s, then every 30 s, for 10 minutes at most.
    commandSent(): void { statusUntil = d.now() + STATUS_MAX_MS; statusAttempt = 0; armStatus(); },
  };
}
