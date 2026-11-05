// W4SEC-07 in the real app: where the safety flags come from, where the "first seen" time is kept, and the one place that turns the
// moments (launch, return to the foreground, back online) into a look at the waiting update. app.ts owns the screen; this owns nothing
// but the join, and takes everything it touches as a parameter so it runs in a test without a browser.
import type { Db } from "../storage/idb";
import { createAutoUpdate, type AutoUpdate } from "../sw/auto-update";
import type { SinceStore, UpdateController, UpdateOptions } from "../sw/update";
import { isSafe, type UpdateSafety, type UpdateTrigger } from "../sw/update-policy";
import { hasUnsentOutbox, isComposing, settleInflight, type Inflight, type QueryRoot } from "../sw/update-safety";

/** localStorage key of the time a waiting update was first seen (a restart of the app must not reset the 24 hours). */
export const UPDATE_SINCE_KEY = "sf.update.since";

export type KeyValue = Readonly<{ get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }>;
export type UpdateWiringDeps = Readonly<{
  /** The element the screens are drawn in: open composers and sheets are looked for inside it. */
  root: QueryRoot;
  getDb: () => Promise<Db>;
  inflight: Inflight;
  /** The seller is on the pairing screen (the one-time link is gone from the address bar, a reload would lose it). */
  pairing: () => boolean;
  setBlocking: (blocking: boolean) => void;
  storage: KeyValue;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timers?: Readonly<{ set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }>;
}>;
export type UpdateWiring = Readonly<{
  /** Goes to createUpdateController as its fourth argument. */
  options: UpdateOptions;
  /** Called once the controller exists: starts looking, and takes the first look (launch). */
  attach(controller: UpdateController): void;
  /** launch / resume / online. Never throws, does nothing until a controller is attached. */
  check(trigger: UpdateTrigger): void;
}>;

export function sinceStore(storage: KeyValue): SinceStore {
  return {
    read() { const raw = storage.get(UPDATE_SINCE_KEY); const n = raw === null ? NaN : Number(raw); return Number.isFinite(n) && n > 0 ? n : null; },
    write(at) { storage.set(UPDATE_SINCE_KEY, String(Math.trunc(at))); },
    clear() { storage.remove(UPDATE_SINCE_KEY); },
  };
}

export function createUpdateWiring(deps: UpdateWiringDeps): UpdateWiring {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const timers = deps.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  let auto: AutoUpdate | null = null;

  // The four flags, read now. The wait is for a poll that started a moment ago (coming back to the app starts one); the flags are read after it.
  const measure = async (): Promise<UpdateSafety> => {
    await settleInflight(deps.inflight, sleep);
    let unsentOutbox = true; // if the outbox can not be read we do not know, so: unsafe
    try { unsentOutbox = await hasUnsentOutbox(await deps.getDb()); } catch { unsentOutbox = true; }
    return { unsentOutbox, composing: isComposing(deps.root), requestInFlight: deps.inflight.count() > 0, pairing: deps.pairing() };
  };
  const options: UpdateOptions = { now, since: sinceStore(deps.storage), canReload: async () => isSafe(await measure()) };
  const check = (trigger: UpdateTrigger): void => { void auto?.check(trigger).catch(() => undefined); };
  return {
    options,
    check,
    attach(controller) {
      auto = createAutoUpdate({ controller, safety: measure, now, setBlocking: deps.setBlocking, timers });
      // The new worker took over but the reload was held: look again soon instead of waiting for the next time the seller comes back.
      controller.subscribe((state) => { if (state === "reload") check("timer"); });
      check("launch");
    },
  };
}
