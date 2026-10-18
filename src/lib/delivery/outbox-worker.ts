import "server-only";

import { recordWorkerFailure, recordWorkerSuccess } from "@/lib/integrations/worker-health";

const WORKER_KEY = Symbol.for("sahelflow.courier.outbox-worker.v1");
const POLL_INTERVAL_MS = 10_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

export function startCourierOutboxWorker(): void {
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
        { drainDueCourierBookings },
        { requireLicenseEntitlement },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/delivery/canonical-courier"),
        import("@/lib/license/license-authority"),
      ]);
      await requireLicenseEntitlement(undefined, shopContext);
      await drainDueCourierBookings({ prisma: db, shop: shopContext }, 10);
      recordWorkerSuccess("courier-outbox");
    } catch (error) {
      // Durable queued/retrying/ambiguous state remains authority. The next
      // bounded tick retries only known-safe work and never duplicates an
      // ambiguous provider shipment.
      // Only a failure CODE is recorded (INT-10): never the message, a URL or a
      // customer value.
      recordWorkerFailure("courier-outbox", error);
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.timer = setTimeout(() => void tick(), 2_500);
  state.timer.unref?.();
}
