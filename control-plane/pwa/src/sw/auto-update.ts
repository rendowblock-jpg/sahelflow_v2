// The glue of W4SEC-07: at the right moments look at the waiting update and the safety flags, ask the pure rules (update-policy.ts) what
// to do, and do it. It owns the one timer and the throttle; everything else (clock, timers, flags, the prompt) is handed in, so it runs
// the same under test as on the phone.
//   apply = SKIP_WAITING now (the reload follows the controller change, held if something turned unsafe in between)
//   hold  = unsafe or not a natural moment: the small banner (the seller's tap) stays; a timer looks again when the update turns overdue
//   block = overdue and unsafe: the stronger prompt (setBlocking(true)), and a look every UPDATE_RECHECK_MS so it applies itself once safe
import type { UpdateController } from "./update";
import { UPDATE_CHECK_MIN_GAP_MS, UPDATE_MAX_WAIT_MS, UPDATE_RECHECK_MS, decideUpdate, type UpdateDecision, type UpdateSafety, type UpdateTrigger } from "./update-policy";

export type AutoUpdateDeps = Readonly<{
  controller: Pick<UpdateController, "state" | "waitingSince" | "applyAutomatically" | "checkForUpdate">;
  /** The four flags, measured now. true = unsafe. */
  safety: () => Promise<UpdateSafety>;
  now: () => number;
  /** true = show the stronger prompt that can not be dismissed; false = back to the small banner (or nothing). */
  setBlocking: (blocking: boolean) => void;
  timers: Readonly<{ set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }>;
}>;
export type AutoUpdate = Readonly<{ check(trigger: UpdateTrigger): Promise<UpdateDecision> }>;

// If the flags can not be measured we do not know they are safe.
const UNKNOWN: UpdateSafety = { unsentOutbox: true, composing: true, requestInFlight: true, pairing: true };

export function createAutoUpdate(deps: AutoUpdateDeps): AutoUpdate {
  const { controller, timers } = deps;
  let timer: unknown = null;
  let blocking = false;
  let lastAsk: number | null = null;

  const disarm = (): void => { if (timer !== null) { timers.clear(timer); timer = null; } };
  const arm = (ms: number): void => { disarm(); timer = timers.set(() => { timer = null; void check("timer"); }, Math.max(0, ms)); };
  const show = (next: boolean): void => { if (next === blocking) return; blocking = next; deps.setBlocking(next); };
  // Ask the browser for a newer worker when the seller comes back, at most once an hour. Not awaited: it must never slow the decision.
  const askBrowser = (): void => {
    const at = deps.now();
    if (lastAsk !== null && at - lastAsk < UPDATE_CHECK_MIN_GAP_MS) return;
    lastAsk = at;
    void controller.checkForUpdate();
  };

  async function check(trigger: UpdateTrigger): Promise<UpdateDecision> {
    if (trigger !== "timer") askBrowser();
    let safety: UpdateSafety;
    try { safety = await deps.safety(); } catch { safety = UNKNOWN; }
    // Read the controller AFTER the wait: the seller may have tapped, or another look may have applied the update meanwhile.
    const state = controller.state();
    const since = controller.waitingSince();
    const at = deps.now();
    const decision = decideUpdate({ state, trigger, safety, since, now: at });
    if (decision === "apply") {
      disarm(); show(false);
      controller.applyAutomatically();
    } else if (decision === "block") {
      show(true); arm(UPDATE_RECHECK_MS);
    } else if (decision === "hold") {
      show(false);
      if (since !== null) arm(UPDATE_MAX_WAIT_MS - (at - since)); // wake up when the update turns overdue
    } else if (state === "idle") { disarm(); show(false); }
    return decision;
  }
  return { check };
}
