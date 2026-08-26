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
        {
          drainDueWhatsAppMediaFetches,
          reconcileQueuedWhatsAppMediaFetches,
        },
        { reconcileWhatsAppMediaEraseAfterRestart },
        { whatsAppMediaRoot },
        { reconcileAbandonedWhatsAppMediaTemps },
        { requireLicenseEntitlement },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/whatsapp/durable-send"),
        import("@/lib/whatsapp/media-fetch-worker"),
        import("@/lib/whatsapp/media-erase-lifecycle"),
        import("@/lib/whatsapp/media-object-store"),
        import("@/lib/whatsapp/media-temp-reconciliation"),
        import("@/lib/license/license-authority"),
      ]);
      const context = { prisma: db, shop: shopContext } as const;

      // Local crash recovery is not a provider effect and must not be blocked by
      // an expired entitlement. Resolve a stale privacy tombstone before any
      // licensed WhatsApp work can observe it as a permanent write barrier.
      reconcileWhatsAppMediaEraseAfterRestart(
        whatsAppMediaRoot(context),
        await db.message.count(),
      );

      await requireLicenseEntitlement(undefined, shopContext);
      await drainDueWhatsAppEffects(context, 10);
      reconcileAbandonedWhatsAppMediaTemps(context);
      await reconcileQueuedWhatsAppMediaFetches(context, 24);
      await drainDueWhatsAppMediaFetches(context, 4);
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
