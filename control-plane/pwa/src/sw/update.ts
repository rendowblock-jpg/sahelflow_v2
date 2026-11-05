// "Update" flow: a new worker waits. The seller's tap (apply) takes it at once, always. Since W4SEC-07 the app can also take it by itself
// (applyAutomatically) at a safe moment chosen by auto-update.ts; this file only does the mechanics and never decides "when".
// Called with three arguments it behaves exactly as it always did.
export interface WorkerLike { state: string; postMessage(message: unknown): void; addEventListener(type: "statechange", listener: () => void): void }
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  active: WorkerLike | null;
  addEventListener(type: "updatefound", listener: () => void): void;
  /** Asks the browser for a newer worker (the real registration has it). */
  update?(): Promise<unknown>;
}
export interface ContainerLike { controller: unknown; addEventListener(type: "controllerchange", listener: () => void): void }
/** reload = the new worker already runs the page but the reload was held back because something turned unsafe; a safe moment (or a tap) finishes it. */
export type UpdateState = "idle" | "waiting" | "applying" | "reload";
/** Where the time a waiting update was first seen is kept, so a restart of the app does not reset the clock. */
export type SinceStore = Readonly<{ read(): number | null; write(at: number): void; clear(): void }>;
export type UpdateOptions = Readonly<{
  now?: () => number;
  /** Asked once the new worker took over, before an AUTOMATIC reload. false = hold the reload (state "reload"). The tap never asks. */
  canReload?: () => Promise<boolean>;
  since?: SinceStore;
}>;
export type UpdateController = Readonly<{
  state(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  /** The seller's tap: take the update and reload at once. Never held back. */
  apply(): void;
  /** The automatic path. true = it acted (took the waiting update, or retried a held reload); false = nothing to do. */
  applyAutomatically(): boolean;
  /** When the waiting update was first seen, or null when nothing waits. */
  waitingSince(): number | null;
  /** Asks the browser for a newer worker. Never throws (offline is normal). */
  checkForUpdate(): Promise<void>;
}>;

export function createUpdateController(reg: RegistrationLike, container: ContainerLike, reload: () => void, options: UpdateOptions = {}): UpdateController {
  const now = options.now ?? Date.now;
  let state: UpdateState = reg.waiting ? "waiting" : "idle";
  let since: number | null = null;
  let reloaded = false;
  let trying = false;
  let tapped = false;
  const listeners = new Set<(s: UpdateState) => void>();
  const set = (next: UpdateState): void => { if (next === state) return; state = next; for (const l of [...listeners]) l(state); };
  const markSeen = (): void => { since = now(); options.since?.write(since); };
  if (reg.waiting) {
    // A value from the future (the phone clock moved) is not trusted: the clock starts now.
    const stored = options.since?.read() ?? null;
    if (stored !== null && Number.isFinite(stored) && stored <= now()) since = stored; else markSeen();
  } else options.since?.clear(); // nothing waits: the new shell took over (or there is nothing to take)
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      // Without a controller this is the first install, not an update.
      if (worker.state === "installed" && container.controller && state === "idle") { markSeen(); set("waiting"); }
    });
  });
  const doReload = (): void => { if (reloaded) return; reloaded = true; reload(); };
  // The new worker controls the page. Reload now if the seller tapped or nobody asked to wait; else ask first, and hold when unsafe.
  const tryReload = async (): Promise<void> => {
    if (reloaded || trying) return;
    trying = true;
    try {
      let ok = tapped || !options.canReload;
      if (!ok) { try { ok = await options.canReload!(); } catch { ok = false; } }
      if (ok || tapped) doReload(); else set("reload");
    } finally { trying = false; }
  };
  container.addEventListener("controllerchange", () => {
    if (state !== "applying") return;
    void tryReload();
  });
  return {
    state: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    apply() {
      if (state === "reload") { tapped = true; doReload(); return; }
      if (state === "applying") { tapped = true; return; } // already asked; the reload now will not wait for a safe moment
      const waiting = reg.waiting;
      if (state !== "waiting" || !waiting) return;
      tapped = true;
      set("applying");
      waiting.postMessage({ type: "SKIP_WAITING" });
    },
    applyAutomatically() {
      if (state === "reload") { void tryReload(); return true; }
      const waiting = reg.waiting;
      if (state !== "waiting" || !waiting) return false;
      set("applying");
      waiting.postMessage({ type: "SKIP_WAITING" });
      return true;
    },
    waitingSince: () => (state === "idle" ? null : since),
    async checkForUpdate() { try { await reg.update?.(); } catch { /* offline or blocked: ask again at the next safe look */ } },
  };
}
