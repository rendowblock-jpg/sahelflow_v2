import "server-only";

/**
 * Abandoned-cart sweep worker (FD-061 EX-4) — same shape as the Meta CAPI
 * worker: one module-level singleton poll, unref'd timer, bounded work, and
 * the durable ledger remaining authority on any error. The research
 * contract prescribes an hourly sweep that marks pending carts older than
 * 30 minutes as abandoned.
 */

const WORKER_KEY = Symbol.for("sahelflow.storefront.abandoned-cart-worker.v1");
const SWEEP_INTERVAL_MS = 60 * 60_000;
const FIRST_TICK_DELAY_MS = 5 * 60_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

export function startAbandonedCartWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;

  const state: WorkerState = { running: false, timer: null };
  workerGlobal[WORKER_KEY] = state;

  const schedule = (delayMs: number) => {
    state.timer = setTimeout(() => void tick(), delayMs);
    state.timer.unref?.();
  };

  const tick = async () => {
    if (state.running) {
      schedule(SWEEP_INTERVAL_MS);
      return;
    }
    state.running = true;
    try {
      const [{ db, shopContext }, { markStaleCartsAbandoned }] = await Promise.all([
        import("@/lib/db"),
        import("./abandoned-cart-service"),
      ]);
      await markStaleCartsAbandoned({ prisma: db, shop: shopContext });
    } catch {
      // Durable pending/abandoned/converted state remains authority; the
      // next hourly sweep re-derives everything from capturedAt.
    } finally {
      state.running = false;
      schedule(SWEEP_INTERVAL_MS);
    }
  };

  schedule(FIRST_TICK_DELAY_MS);
}
