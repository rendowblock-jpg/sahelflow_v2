import "server-only";

const WORKER_KEY = Symbol.for("sahelflow.automation-worker.v1");
const POLL_INTERVAL_MS = 2_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

export function startAutomationWorker(): void {
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
        { requireLicenseEntitlement },
        { drainDueAutomationTriggers },
        { drainDueAutomationRuns },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/license/license-authority"),
        import("@/lib/automations/trigger-processor"),
        import("@/lib/automations/run-processor"),
      ]);
      // The process DB and immutable ShopContext belong to the exact active
      // native runtime. Inactive-shop work remains durable and is not drained.
      await requireLicenseEntitlement(undefined, shopContext);
      await drainDueAutomationTriggers({ prisma: db, shop: shopContext }, 10);
      await drainDueAutomationRuns({ prisma: db, shop: shopContext }, 10);
    } catch {
      // Durable trigger/run/step state remains authoritative. The next bounded
      // tick retries due work without logging provider payload or seller PII.
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.timer = setTimeout(() => void tick(), 2_000);
  state.timer.unref?.();
}
