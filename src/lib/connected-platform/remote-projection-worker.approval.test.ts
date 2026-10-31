import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WS = "ws_test_0001";
const A = "phone_aaaaaaaa";
const B = "phone_bbbbbbbb";
const KEY = Symbol.for("sahelflow.connected-projection-worker.v1");

const h = vi.hoisted(() => ({
  root: "",
  lists: 0,
  devices: [] as unknown[],
  publish: vi.fn(),
  publishOrders: vi.fn(async () => ({ sequence: 1 })),
  publishConversations: vi.fn(async () => ({ sequence: 1 })),
  invalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/data-root", () => ({ dataRoot: () => h.root }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { workspaceId: "ws_test_0001" } }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn(async () => ({})) }));
vi.mock("@/lib/identity/trusted-actor", () => ({
  trustedActorForRemoteCommand: vi.fn(async (memberId: string, deviceId: string) => ({ memberId, deviceId })),
}));
vi.mock("./runtime", () => ({
  loadConnectedRuntimeIfEnrolled: vi.fn(async () => ({
    client: {
      listDevices: async () => { h.lists += 1; return { devices: h.devices }; },
      invalidateMemberCommandPolicies: h.invalidate,
    },
    desktopKeys: {},
  })),
}));
vi.mock("./desktop-projection", () => ({ publishRemoteDashboardProjection: h.publish }));
vi.mock("./orders-projection", () => ({ publishRemoteOrdersProjection: h.publishOrders }));
vi.mock("./conversations-projection", () => ({ publishRemoteConversationsProjection: h.publishConversations }));

import {
  deviceApprovalsPath,
  readDeviceApprovals,
  updateDeviceApprovals,
  withDeviceApproved,
  withoutDevice,
} from "./device-approvals";
import {
  kickConnectedProjectionWorker,
  publishToApprovedDevices,
  startConnectedProjectionWorker,
} from "./remote-projection-worker";

type Worker = { running: boolean; timer: ReturnType<typeof setTimeout> | null };
const worker = () => (globalThis as unknown as Record<symbol, Worker | undefined>)[KEY] as Worker;
const publishedIds = () => h.publish.mock.calls.map((call) => (call[0] as { deviceId: string }).deviceId);

// Moves the fake clock and waits until exactly one more tick has finished.
async function runTick(ms: number) {
  const before = h.lists;
  await vi.advanceTimersByTimeAsync(ms);
  await vi.waitFor(() => {
    expect(h.lists).toBe(before + 1);
    expect(worker().running).toBe(false);
  });
}

beforeEach(async () => {
  h.root = await mkdtemp(join(tmpdir(), "sf-worker-"));
  h.lists = 0;
  h.devices = [
    { device_id: A, member_id: "member_owner_1" },
    { device_id: B, member_id: "member_owner_1" },
  ];
  h.publish.mockReset();
  h.invalidate.mockReset();
  delete (globalThis as unknown as Record<symbol, unknown>)[KEY];
  vi.useFakeTimers();
});

afterEach(async () => {
  const state = worker();
  if (state?.timer) clearTimeout(state.timer);
  delete (globalThis as unknown as Record<symbol, unknown>)[KEY];
  vi.useRealTimers();
  await rm(h.root, { recursive: true, force: true });
});

describe("the desktop approval gate in the projection worker", () => {
  it("a pending phone gets nothing published", async () => {
    startConnectedProjectionWorker();
    await runTick(2_000);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("approve: published on the next tick, and only for the approved phone", async () => {
    startConnectedProjectionWorker();
    await runTick(2_000);
    expect(h.publish).not.toHaveBeenCalled();
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(state, A, 1));
    await runTick(8 * 60 * 1000);
    expect(publishedIds()).toEqual([A]);
  });

  it("kick publishes within a second instead of waiting eight minutes", async () => {
    startConnectedProjectionWorker();
    await runTick(2_000);
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(state, B, 1));
    kickConnectedProjectionWorker();
    await runTick(500);
    expect(publishedIds()).toEqual([B]);
  });

  it("revoke: nothing more is published and the record is gone", async () => {
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(state, A, 1));
    startConnectedProjectionWorker();
    await runTick(2_000);
    expect(publishedIds()).toEqual([A]);
    await updateDeviceApprovals(WS, (state) => withoutDevice(state, A));
    h.publish.mockClear();
    await runTick(8 * 60 * 1000);
    expect(h.publish).not.toHaveBeenCalled();
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
  });

  it("a missing approvals file means nobody is approved", async () => {
    await expect(readDeviceApprovals(WS).then((state) => state.approved)).resolves.toEqual({});
    startConnectedProjectionWorker();
    await runTick(2_000);
    expect(h.publish).not.toHaveBeenCalled();
    expect(deviceApprovalsPath()).toContain(h.root);
  });

  it("a failing approved phone invalidates its member's policies and does not stop the next one", async () => {
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(withDeviceApproved(state, A, 1), B, 2));
    h.publish.mockRejectedValueOnce(new Error("boom"));
    startConnectedProjectionWorker();
    await runTick(2_000);
    expect(publishedIds()).toEqual([A, B]);
    expect(h.invalidate).toHaveBeenCalledWith(WS, "member_owner_1");
  });
});

describe("publishToApprovedDevices", () => {
  const devices = [{ deviceId: A }, { deviceId: B }, { deviceId: "phone_cccccccc" }];
  it("reports published, pending and failed phones", async () => {
    const failures: string[] = [];
    const result = await publishToApprovedDevices({
      devices,
      approvedIds: new Set([A, "phone_cccccccc"]),
      publish: async (device) => { if (device.deviceId === A) throw new Error("x"); },
      onFailure: (device) => { failures.push(device.deviceId); },
    });
    expect(result).toEqual({ published: ["phone_cccccccc"], skippedPending: [B], failed: [A] });
    expect(failures).toEqual([A]);
  });
  it("with nobody approved publishes nothing and never calls publish", async () => {
    const publish = vi.fn();
    const result = await publishToApprovedDevices({ devices, approvedIds: new Set(), publish, onFailure: vi.fn() });
    expect(publish).not.toHaveBeenCalled();
    expect(result.skippedPending).toHaveLength(3);
  });
});
