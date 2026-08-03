import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { processWhatsAppInbound } from "./inbound-processor";

const WORKER_KEY = Symbol.for("sahelflow.whatsapp.inbound-worker.v1");
const POLL_INTERVAL_MS = 5_000;
const LEASE_MS = 90_000;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type WorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: WorkerState;
};

/** Drain only work owned by the exact process-active shop database. */
export async function drainDueWhatsAppIngress(
  context: ServiceContext,
  limit = 20,
): Promise<number> {
  const now = new Date();
  const expiredLeaseBefore = new Date(now.getTime() - LEASE_MS);
  const events = await context.prisma.providerIngressEvent.findMany({
    where: {
      provider: "whatsapp",
      OR: [
        { status: "received" },
        {
          status: "retrying",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        {
          status: "processing",
          OR: [{ lockedAt: null }, { lockedAt: { lte: expiredLeaseBefore } }],
        },
      ],
    },
    orderBy: [{ providerTimestamp: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true },
  });

  let processed = 0;
  for (const event of events) {
    try {
      await processWhatsAppInbound(context, event.id);
      processed += 1;
    } catch {
      // The durable event and attempt rows remain authoritative. One malformed
      // or transiently failing item must not block later due ingress work.
    }
  }
  return processed;
}

export function startWhatsAppInboundWorker(): void {
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
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/license/license-authority"),
      ]);
      await requireLicenseEntitlement(undefined, shopContext);
      await drainDueWhatsAppIngress({ prisma: db, shop: shopContext }, 20);
    } catch {
      // License lockout, shop quiescence, migration or startup failure leaves
      // exact-shop ingress rows queued for the next bounded tick/runtime.
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.timer = setTimeout(() => void tick(), 1_000);
  state.timer.unref?.();
}
