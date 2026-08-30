import "server-only";

import { logger } from "@/lib/logger";

const WORKER_KEY = Symbol.for("sahelflow.storefront-receipt-worker.v1");
const POLL_INTERVAL_MS = 5_000;
const CURSOR_KEY_PREFIX = "connected.storefront.receipt.cursor.v1";

type WorkerState = { running: boolean; timer: ReturnType<typeof setTimeout> | null };
type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: WorkerState };

export function startStorefrontReceiptWorker(): void {
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
        { loadStorefrontRuntime },
        { importHostedStorefrontReceipts },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/license/license-authority"),
        import("./runtime"),
        import("./storefront-receipt-import"),
      ]);
      await requireLicenseEntitlement("sahelflow.storefront", shopContext);
      const context = { prisma: db, shop: shopContext };
      const runtime = await loadStorefrontRuntime(context);
      const cursorKey = `${CURSOR_KEY_PREFIX}.${shopContext.shopId}`;
      const stored = await db.setting.findUnique({ where: { key: cursorKey } });
      const after = Number(stored?.value ?? "0");
      if (!Number.isSafeInteger(after) || after < 0) {
        throw new Error("Storefront receipt cursor authority is invalid");
      }
      const result = await importHostedStorefrontReceipts({
        client: runtime.client,
        context,
        workspaceId: shopContext.workspaceId,
        encryptionPrivateKeyPkcs8: runtime.receiptKeys.privateKeyPkcs8,
        after,
        limit: 50,
      });
      if (result.nextCursor > after) {
        await db.setting.upsert({
          where: { key: cursorKey },
          create: { key: cursorKey, value: String(result.nextCursor) },
          update: { value: String(result.nextCursor) },
        });
      }
    } catch (error) {
      // C1: the silent catch hid relay stalls (poison receipts, broken
      // decryption enrollment, relay outages) behind a permanently frozen
      // cursor. The cursor and canonical order idempotency retain their
      // durable retry authority; the classified warn keeps every repeated
      // tick failure operator-visible.
      logger.warn("storefront.receipt_worker.tick_failed", {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      state.running = false;
      schedule();
    }
  };
  state.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  state.timer.unref?.();
}
