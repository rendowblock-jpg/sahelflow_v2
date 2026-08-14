import "server-only";

const WORKER_KEY = Symbol.for("sahelflow.connected-command-worker.v1");
const POLL_INTERVAL_MS = 5_000;
const CURSOR_KEY_PREFIX = "connected.command.cursor.v1";

type WorkerState = { running: boolean; timer: ReturnType<typeof setTimeout> | null };
type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: WorkerState };

export function startConnectedCommandWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;
  const state: WorkerState = { running: false, timer: null };
  workerGlobal[WORKER_KEY] = state;
  const schedule = () => {
    state.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    state.timer.unref?.();
  };
  const tick = async () => {
    if (state.running) { schedule(); return; }
    state.running = true;
    try {
      const [{ db, shopContext }, { requireLicenseEntitlement }, runtimeModule, executor] =
        await Promise.all([
          import("@/lib/db"),
          import("@/lib/license/license-authority"),
          import("./runtime"),
          import("./remote-command-executor"),
        ]);
      await requireLicenseEntitlement("sahelflow.connected", shopContext);
      const context = { prisma: db, shop: shopContext };
      const runtime = await runtimeModule.loadConnectedRuntimeIfEnrolled(context);
      if (!runtime) throw new Error("Connected command authority is not enrolled");
      const cursorKey = `${CURSOR_KEY_PREFIX}.${shopContext.shopId}`;
      const stored = await db.setting.findUnique({ where: { key: cursorKey } });
      const after = Number(stored?.value ?? "0");
      if (!Number.isSafeInteger(after) || after < 0) throw new Error("Remote command cursor is invalid");
      const result = await executor.executeQueuedRemoteCommands({
        client: runtime.client,
        desktopKeys: runtime.desktopKeys,
        context,
        after,
      });
      if (result.nextCursor > after) {
        await db.setting.upsert({
          where: { key: cursorKey },
          create: { key: cursorKey, value: String(result.nextCursor) },
          update: { value: String(result.nextCursor) },
        });
      }
    } catch {
      // Exact command idempotency and the cursor retain durable retry authority.
    } finally {
      state.running = false;
      schedule();
    }
  };
  state.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  state.timer.unref?.();
}
