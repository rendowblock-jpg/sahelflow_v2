import "server-only";

/**
 * Meta CAPI outbox worker — same shape as the courier outbox worker: one
 * module-level singleton poll, unref'd timer, bounded drain, and durable
 * state remaining authority on any error. Triggers ride the desktop outbox —
 * never a Worker.
 */

const WORKER_KEY = Symbol.for("sahelflow.meta.capi-worker.v1");
const POLL_INTERVAL_MS = 10_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

export function startMetaCapiWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;

  const state: WorkerState = { running: false, timer: null };
  workerGlobal[WORKER_KEY] = state;

  const schedule = () => {
    state.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    state.timer.unref?.();
  };

  const tick = async () => {
    if (state.running) {
      schedule();
      return;
    }
    state.running = true;
    try {
      const [{ db, shopContext }, { drainDueCapiSends }] = await Promise.all([
        import("@/lib/db"),
        import("./capi-effect-runtime"),
      ]);
      await drainDueCapiSends({ prisma: db, shop: shopContext }, 10);
    } catch {
      // Durable queued/retrying/failed state remains authority. The next
      // bounded tick retries only known-safe work and never duplicates a
      // Meta event (the ledger claim is the idempotency authority).
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.timer = setTimeout(() => void tick(), 2_500);
  state.timer.unref?.();
}
