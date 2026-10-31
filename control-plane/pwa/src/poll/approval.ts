// "Waiting for your PC to approve": polls the relay with a calm schedule and
// gives up after ten minutes. Pure: the clock, timers and tab visibility are
// injected, so the schedule is tested with fake timers.
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000];
export const STEADY_MS = 8000;
export const APPROVAL_TIMEOUT_MS = 10 * 60_000;

// Gap after the (index+1)-th poll: 1 s, 2 s, 4 s, then every 8 s.
export const delayAfter = (index: number): number => BACKOFF_MS[index] ?? STEADY_MS;

export type ApprovalPoll = "pending" | "approved" | "revoked" | "retry";
export type ApprovalEnd = "approved" | "revoked" | "timeout";
export type ApprovalDeps = Readonly<{
  poll(): Promise<ApprovalPoll>;
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  isHidden(): boolean;
  onVisibilityChange(run: () => void): () => void;
  onEnd(end: ApprovalEnd): void;
  timeoutMs?: number;
}>;

export function watchApproval(deps: ApprovalDeps): Readonly<{ stop(): void }> {
  const startedAt = deps.now(); const limit = deps.timeoutMs ?? APPROVAL_TIMEOUT_MS;
  let polls = 0; let handle: unknown = null; let stopped = false; let inFlight = false;
  const clear = (): void => { if (handle !== null) { deps.clearTimer(handle); handle = null; } };
  const expired = (): boolean => deps.now() - startedAt >= limit;
  let unsubscribe: () => void = () => undefined;
  const halt = (): void => { stopped = true; clear(); unsubscribe(); };
  const finish = (end: ApprovalEnd): void => { if (stopped) return; halt(); deps.onEnd(end); };
  const schedule = (): void => {
    clear();
    if (stopped || deps.isHidden()) return;
    handle = deps.setTimer(() => { handle = null; void tick(); }, delayAfter(polls - 1));
  };
  async function tick(): Promise<void> {
    if (stopped || inFlight || deps.isHidden()) return;
    if (expired()) return finish("timeout");
    inFlight = true;
    let result: ApprovalPoll;
    try { result = await deps.poll(); } catch { result = "retry"; } finally { inFlight = false; }
    if (stopped) return;
    if (result === "approved" || result === "revoked") return finish(result);
    polls += 1;
    if (expired()) return finish("timeout");
    schedule();
  }
  // Hidden tab: no timer. Shown again: poll at once and start the backoff over.
  unsubscribe = deps.onVisibilityChange(() => {
    if (stopped) return;
    if (deps.isHidden()) { clear(); return; }
    polls = 0; clear(); void tick();
  });
  void tick();
  return { stop(): void { if (!stopped) halt(); } };
}
