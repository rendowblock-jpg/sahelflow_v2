import "server-only";

import { recordWorkerFailure, recordWorkerSuccess } from "@/lib/integrations/worker-health";

const WORKER_KEY = Symbol.for("sahelflow.commerce-worker.v1");
const POLL_INTERVAL_MS = 2_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

export function startCommerceSyncWorker(): void {
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
        { drainCommerceRuntime },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/license/license-authority"),
        import("@/lib/integrations/ecommerce/processor"),
      ]);
      // The process DB and immutable ShopContext belong to the exact active
      // native runtime. Inactive-shop runs remain durable and are not drained.
      await requireLicenseEntitlement(undefined, shopContext);
      await drainCommerceRuntime(
        { prisma: db, shop: shopContext },
        { fetches: 2, items: 20, finalizations: 10 },
      );
      recordWorkerSuccess("commerce-sync");
    } catch (error) {
      // Run/item state remains authoritative. The next bounded tick retries due
      // work without logging decrypted provider payload or customer PII.
      // Only a failure CODE is recorded (INT-10): never the message, a URL or a
      // customer value.
      recordWorkerFailure("commerce-sync", error);
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  state.timer.unref?.();
}
