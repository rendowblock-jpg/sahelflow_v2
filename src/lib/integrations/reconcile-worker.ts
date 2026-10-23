import "server-only";

import {
  recordWorkerFailure,
  recordWorkerIdle,
  recordWorkerSuccess,
} from "@/lib/integrations/worker-health";
import type { ReconcileState } from "@/lib/integrations/scheduled-reconcile";
import { SahelFlowError } from "@/types/errors";

/**
 * INT-03: the scheduled courier-status and commerce-order pull. A desktop has no
 * public address, so it cannot receive webhooks; while the app is open this
 * worker asks instead. The work itself (what to pull, how often, what to do
 * when a provider is down) is in scheduled-reconcile.ts.
 *
 * It ticks every minute and does nothing until a cycle is due (every ten
 * minutes). A first tick waits a minute and a half after start so the seller's
 * workspace is not competing with provider calls while it opens.
 */

const WORKER_KEY = Symbol.for("sahelflow.scheduled-reconcile-worker.v1");
const TICK_MS = 60_000;
const FIRST_TICK_MS = 90_000;

type WorkerState = {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  reconcile: ReconcileState | null;
};

type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: WorkerState };

export function startScheduledReconcileWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;
  const state: WorkerState = { timer: null, running: false, reconcile: null };
  workerGlobal[WORKER_KEY] = state;

  const schedule = (delayMs: number) => {
    state.timer = setTimeout(() => void tick(), delayMs);
    state.timer.unref?.();
  };

  const tick = async () => {
    if (state.running) return schedule(TICK_MS);
    state.running = true;
    try {
      const [
        { db, shopContext },
        { requireLicenseEntitlement },
        reconcile,
        { synchronizeCanonicalCourierTracking },
        { queueCommerceSync },
        { loadEcommerceCredentials },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/license/license-authority"),
        import("@/lib/integrations/scheduled-reconcile"),
        import("@/lib/delivery/canonical-courier"),
        import("@/lib/integrations/ecommerce/queue"),
        import("@/lib/integrations/ecommerce"),
      ]);
      // The process DB and the immutable ShopContext belong to the exact
      // active runtime; a shop that is not entitled pulls nothing.
      await requireLicenseEntitlement(undefined, shopContext);
      state.reconcile ??= reconcile.newReconcileState();
      const report = await reconcile.runScheduledReconcile(
        { prisma: db, shop: shopContext },
        state.reconcile,
        {
          syncCourier: (context, orderId) =>
            synchronizeCanonicalCourierTracking(context, orderId),
          queueCommerce: (context, platform) =>
            queueCommerceSync(context, platform),
          hasCommerceCredentials: async (context, platform) =>
            (await loadEcommerceCredentials(context, platform)) !== null,
        },
      );
      const attempted =
        report.courier.attempted +
        report.commerce.queued.length +
        report.commerce.failed;
      const succeeded = report.courier.synced + report.commerce.queued.length;
      if (attempted === 0) {
        recordWorkerIdle("scheduled-reconcile", "nothing_due");
      } else if (succeeded === 0) {
        // Every attempt of this cycle failed: the individual codes are in the
        // report, the worker health keeps one summary code.
        throw new SahelFlowError(
          "Scheduled reconcile: every attempt failed",
          "RECONCILE_ALL_FAILED",
          502,
        );
      } else {
        recordWorkerSuccess("scheduled-reconcile");
      }
    } catch (error) {
      // Only a failure CODE is recorded (INT-10): never the message, a URL or a
      // customer value. The next tick retries when a cycle is due.
      recordWorkerFailure("scheduled-reconcile", error);
    } finally {
      state.running = false;
      schedule(TICK_MS);
    }
  };

  schedule(FIRST_TICK_MS);
}
