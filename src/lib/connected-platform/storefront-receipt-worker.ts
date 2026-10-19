import "server-only";

import {
  recordWorkerFailure,
  recordWorkerIdle,
  recordWorkerSuccess,
} from "@/lib/integrations/worker-health";
import { logger } from "@/lib/logger";

import { IDLE_POLL_INTERVAL_MS, isConnectedIdleState } from "./worker-idle";
import {
  POLL_ACTIVE_MS,
  failureDelayMs,
  receiptPollDelayMs,
} from "./poll-cadence";

const WORKER_KEY = Symbol.for("sahelflow.storefront-receipt-worker.v1");
const CURSOR_KEY_PREFIX = "connected.storefront.receipt.cursor.v1";

type WorkerState = { running: boolean; timer: ReturnType<typeof setTimeout> | null };
type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: WorkerState };

export function startStorefrontReceiptWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;
  const state: WorkerState = { running: false, timer: null };
  workerGlobal[WORKER_KEY] = state;

  let idle = false;
  // Quick right after a receipt, then relaxing (poll-cadence.ts). A customer's
  // order only has to reach the desktop within about a minute.
  let emptyStreak = 0;
  let consecutiveFailures = 0;
  let nextDelayMs = POLL_ACTIVE_MS;
  const schedule = () => {
    state.timer = setTimeout(() => void tick(), idle ? IDLE_POLL_INTERVAL_MS : nextDelayMs);
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
        encryptionPublicKeyJwk: runtime.receiptKeys.publicKeyJwk,
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
      if (idle) logger.info("storefront.receipt_worker.resumed");
      idle = false;
      consecutiveFailures = 0;
      emptyStreak = result.imported + result.replayed > 0 ? 0 : emptyStreak + 1;
      nextDelayMs = receiptPollDelayMs({
        hadWork: result.imported + result.replayed > 0,
        emptyStreak,
      });
      recordWorkerSuccess("storefront-receipts");
    } catch (error) {
      if (isConnectedIdleState(error)) {
        // No storefront enrolled or entitled: rest quietly, say so once.
        if (!idle) logger.info("storefront.receipt_worker.idle");
        idle = true;
        recordWorkerIdle("storefront-receipts", "not_enrolled");
        return;
      }
      idle = false;
      consecutiveFailures += 1;
      // Back off instead of hammering a relay that is already struggling; the
      // first retry stays quick so a one-off hiccup costs only five seconds.
      nextDelayMs = failureDelayMs(consecutiveFailures);
      emptyStreak = 0;
      // C1: the silent catch hid relay stalls (poison receipts, broken
      // decryption enrollment, relay outages) behind a permanently frozen
      // cursor. The cursor and canonical order idempotency retain their
      // durable retry authority; the coded, throttled record below keeps a
      // stalled ingest operator-visible without ever logging an error message
      // (a relay or decryption message can carry receipt or customer data).
      recordWorkerFailure("storefront-receipts", error);
    } finally {
      state.running = false;
      schedule();
    }
  };
  state.timer = setTimeout(() => void tick(), POLL_ACTIVE_MS);
  state.timer.unref?.();
}
