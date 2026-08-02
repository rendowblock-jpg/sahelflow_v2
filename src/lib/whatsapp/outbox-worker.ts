import "server-only";

const WORKER_KEY = Symbol.for("sahelflow.whatsapp.outbox-worker.v1");
const POLL_INTERVAL_MS = 10_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

export function startWhatsAppOutboxWorker(): void {
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
      const [
        { db, shopContext },
        { drainDueWhatsAppEffects },
        { requireLicenseEntitlement },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/whatsapp/durable-send"),
        import("@/lib/license/license-authority"),
      ]);
      await requireLicenseEntitlement(undefined, shopContext);
      await drainDueWhatsAppEffects({ prisma: db, shop: shopContext }, 10);
    } catch {
      // Durable queued/retrying/ambiguous state remains authoritative. The next
      // bounded tick retries safe work; provider payload/error text is not logged.
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.timer = setTimeout(() => void tick(), 2_000);
  state.timer.unref?.();
}
