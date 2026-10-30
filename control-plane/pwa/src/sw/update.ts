// "Update" flow: a new worker waits until the seller taps the button. Nothing
// here skips waiting by itself.
export interface WorkerLike { state: string; postMessage(message: unknown): void; addEventListener(type: "statechange", listener: () => void): void }
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  active: WorkerLike | null;
  addEventListener(type: "updatefound", listener: () => void): void;
}
export interface ContainerLike { controller: unknown; addEventListener(type: "controllerchange", listener: () => void): void }
export type UpdateState = "idle" | "waiting" | "applying";
export type UpdateController = Readonly<{ state(): UpdateState; subscribe(listener: (state: UpdateState) => void): () => void; apply(): void }>;

export function createUpdateController(reg: RegistrationLike, container: ContainerLike, reload: () => void): UpdateController {
  let state: UpdateState = reg.waiting ? "waiting" : "idle";
  let reloaded = false;
  const listeners = new Set<(s: UpdateState) => void>();
  const set = (next: UpdateState): void => { if (next === state) return; state = next; for (const l of [...listeners]) l(state); };
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      // Without a controller this is the first install, not an update.
      if (worker.state === "installed" && container.controller && state === "idle") set("waiting");
    });
  });
  container.addEventListener("controllerchange", () => {
    if (state !== "applying" || reloaded) return;
    reloaded = true;
    reload();
  });
  return {
    state: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    apply() {
      const waiting = reg.waiting;
      if (state !== "waiting" || !waiting) return;
      set("applying");
      waiting.postMessage({ type: "SKIP_WAITING" });
    },
  };
}
