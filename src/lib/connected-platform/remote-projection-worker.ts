import "server-only";

import { logger } from "@/lib/logger";

const WORKER_KEY = Symbol.for("sahelflow.connected-projection-worker.v1");
const REFRESH_INTERVAL_MS = 8 * 60 * 1000;
const KICK_DELAY_MS = 500;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
// C2: escalate to error-level logging after ~24 minutes of continuously
// failing ticks (3 × 8min refresh cadence) — persistent projection failures
// mean desktop dashboards silently drift from server truth.
const ESCALATE_AFTER_CONSECUTIVE_FAILURES = 3;

type WorkerState = {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Runs the next tick soon (after the seller approved a phone). */
  kick: (() => void) | null;
};
type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: WorkerState };

type DeviceRow = Readonly<{ deviceId: string; memberId: string }>;

function parseDevice(value: unknown): DeviceRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const deviceId = String(row.device_id ?? "");
  const memberId = String(row.member_id ?? "");
  if (!ID.test(deviceId) || !ID.test(memberId)) return null;
  return Object.freeze({ deviceId, memberId });
}

export function startConnectedProjectionWorker(): void {
  const workerGlobal = globalThis as WorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;
  const state: WorkerState = { running: false, timer: null, kick: null };
  workerGlobal[WORKER_KEY] = state;
  let consecutiveFailures = 0;

  const schedule = () => {
    state.timer = setTimeout(() => void tick(), REFRESH_INTERVAL_MS);
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
        { loadConnectedRuntimeIfEnrolled },
        { trustedActorForRemoteCommand },
        { publishRemoteDashboardProjection },
        { approvedDeviceIds, readDeviceApprovals },
      ] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/license/license-authority"),
        import("./runtime"),
        import("@/lib/identity/trusted-actor"),
        import("./desktop-projection"),
        import("./device-approvals"),
      ]);
      await requireLicenseEntitlement("sahelflow.connected", shopContext);
      const runtime = await loadConnectedRuntimeIfEnrolled({ prisma: db, shop: shopContext });
      if (!runtime) return;
      const enrolled = await runtime.client.listDevices(shopContext.workspaceId);
      // The relay activates a phone at once; the seller's approval on this
      // desktop is the gate. A pending phone gets no projection and no policy.
      const approvedIds = approvedDeviceIds(await readDeviceApprovals(shopContext.workspaceId));
      await publishToApprovedDevices({
        devices: enrolled.devices.map(parseDevice).filter((value): value is DeviceRow => value !== null),
        approvedIds,
        publish: async (device) => {
          const actorContext = await trustedActorForRemoteCommand(
            device.memberId,
            device.deviceId,
            shopContext,
          );
          await publishRemoteDashboardProjection({
            client: runtime.client,
            desktopKeys: runtime.desktopKeys,
            actorContext,
            deviceId: device.deviceId,
          });
        },
        onFailure: async (device, deviceError) => {
          // C2: a device-scoped publish failure was invisible. The policy
          // invalidation below stays fail-closed; the warn keeps the affected
          // device identifiable in the log.
          logger.warn("connected.projection_worker.device_failed", {
            deviceId: device.deviceId,
            memberId: device.memberId,
            reason: deviceError instanceof Error ? deviceError.message : String(deviceError),
          });
          try {
            await runtime.client.invalidateMemberCommandPolicies(
              shopContext.workspaceId,
              device.memberId,
            );
          } catch {
            // Policy TTL remains fail-closed; desktop execution revalidates durable authority.
          }
        },
      });
      consecutiveFailures = 0;
    } catch (error) {
      // C2: the silent catch made projection drift invisible. Connected
      // operation stays optional for permanent local work and the next tick
      // retries; the classified log keeps persistent failures visible.
      consecutiveFailures += 1;
      const detail = {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        consecutiveFailures,
      };
      if (consecutiveFailures >= ESCALATE_AFTER_CONSECUTIVE_FAILURES) {
        logger.error("connected.projection_worker.tick_failed_repeatedly", error, detail);
      } else {
        logger.warn("connected.projection_worker.tick_failed", detail);
      }
    } finally {
      state.running = false;
      schedule();
    }
  };

  state.kick = () => {
    if (state.running) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => void tick(), KICK_DELAY_MS);
    state.timer.unref?.();
  };
  state.timer = setTimeout(() => void tick(), 2_000);
  state.timer.unref?.();
}

/** Asks the running worker to publish soon instead of at the next 8-minute tick. No-op when not started. */
export function kickConnectedProjectionWorker(): void {
  (globalThis as WorkerGlobal)[WORKER_KEY]?.kick?.();
}

export type PublishToApprovedResult = Readonly<{ published: string[]; skippedPending: string[]; failed: string[] }>;

/** Publishes for approved devices only. One device failing never stops the others. */
export async function publishToApprovedDevices<T extends { deviceId: string }>(input: Readonly<{
  devices: readonly T[];
  approvedIds: ReadonlySet<string>;
  publish: (device: T) => Promise<void>;
  onFailure: (device: T, error: unknown) => Promise<void> | void;
}>): Promise<PublishToApprovedResult> {
  const result: { published: string[]; skippedPending: string[]; failed: string[] } = { published: [], skippedPending: [], failed: [] };
  for (const device of input.devices) {
    if (!input.approvedIds.has(device.deviceId)) {
      result.skippedPending.push(device.deviceId);
      continue;
    }
    try {
      await input.publish(device);
      result.published.push(device.deviceId);
    } catch (error) {
      result.failed.push(device.deviceId);
      await input.onFailure(device, error);
    }
  }
  return result;
}
