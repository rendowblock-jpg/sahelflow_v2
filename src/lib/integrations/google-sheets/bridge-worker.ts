import "server-only";

/**
 * Google Sheets bridge worker: every minute, runs a sync when the seller's
 * chosen interval has elapsed. New rows are imported when auto-import is on;
 * statuses are written back when write-back is on. A failed tick records the
 * reason on the bridge and retries at the next interval.
 */

const WORKER_KEY = Symbol.for("sahelflow.google-sheets-bridge-worker.v1");
const TICK_MS = 60_000;

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: { timer: ReturnType<typeof setTimeout> | null; running: boolean };
};

export function startGoogleSheetsBridgeWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;
  const state = { timer: null as ReturnType<typeof setTimeout> | null, running: false };
  workerGlobal[WORKER_KEY] = state;

  const schedule = () => {
    state.timer = setTimeout(() => void tick(), TICK_MS);
    state.timer.unref?.();
  };

  const tick = async () => {
    if (state.running) return schedule();
    state.running = true;
    try {
      const [{ db, shopContext }, { requireLicenseEntitlement }, config, sync] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/license/license-authority"),
          import("./bridge-config"),
          import("./bridge-sync"),
        ]);
      const context = { prisma: db, shop: shopContext };
      const current = await config.loadBridgeConfig(context);
      if (!current.spreadsheetId || (!current.autoImport && !current.writeBack)) return;
      const last = current.lastSyncAt ? Date.parse(current.lastSyncAt) : 0;
      if (Date.now() - last < current.intervalMinutes * 60_000) return;
      await requireLicenseEntitlement(undefined, shopContext);
      await sync.runSheetSync(context, { importRows: current.autoImport });
    } catch {
      // The bridge configuration keeps the last result; the next tick retries.
    } finally {
      state.running = false;
      schedule();
    }
  };

  schedule();
}
