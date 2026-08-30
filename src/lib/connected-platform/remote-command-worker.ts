import "server-only";

import { logger } from "@/lib/logger";

const WORKER_KEY = Symbol.for("sahelflow.connected-command-worker.v1");
const POLL_INTERVAL_MS = 5_000;
const CURSOR_KEY_PREFIX = "connected.command.cursor.v1";
// C2: escalate to error-level logging after ~1 minute of continuously failing
// ticks (12 × 5s) — a persistent command-channel failure needs operator
// attention, not one lost warn line among success noise.
const ESCALATE_AFTER_CONSECUTIVE_FAILURES = 12;

type WorkerState = { running: boolean; timer: ReturnType<typeof setTimeout> | null };
type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: WorkerState };

export function startConnectedCommandWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;
  const state: WorkerState = { running: false, timer: null };
  workerGlobal[WORKER_KEY] = state;
  let consecutiveFailures = 0;
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
      consecutiveFailures = 0;
    } catch (error) {
      // C2: the silent catch made a dead command channel invisible. Exact
      // command idempotency and the cursor retain durable retry authority;
      // the classified log keeps every failure operator-visible and
      // escalates once failures persist.
      consecutiveFailures += 1;
      const detail = {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        consecutiveFailures,
      };
      if (consecutiveFailures >= ESCALATE_AFTER_CONSECUTIVE_FAILURES) {
        logger.error("connected.command_worker.tick_failed_repeatedly", error, detail);
      } else {
        logger.warn("connected.command_worker.tick_failed", detail);
      }
    } finally {
      state.running = false;
      schedule();
    }
  };
  state.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  state.timer.unref?.();
}
