import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";

/**
 * Found by the page sweep (4 Nov 2026, Internal.50): the server log of a licensed install without the
 * "sahelflow.connected" capability (a trial, for example) got a warning every 8 minutes and then an ERROR line
 * ("connected.projection_worker.tick_failed_repeatedly") from the phone-projection worker. worker-idle.ts says that
 * a missing capability or an install with no phone enrolled is the normal resting state, and the command worker
 * already rests quietly there. The projection worker must do the same, and keep warning about real failures.
 */
const KEY = Symbol.for("sahelflow.connected-projection-worker.v1");
const TICK_MS = 8 * 60 * 1000;

const h = vi.hoisted(() => ({
  entitlement: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { workspaceId: "ws_test_0001" } }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: h.entitlement }));
vi.mock("@/lib/identity/trusted-actor", () => ({ trustedActorForRemoteCommand: vi.fn() }));
vi.mock("./runtime", () => ({ loadConnectedRuntimeIfEnrolled: h.runtime }));
vi.mock("./desktop-projection", () => ({ publishRemoteDashboardProjection: vi.fn() }));
vi.mock("./orders-projection", () => ({ publishRemoteOrdersProjection: vi.fn() }));
vi.mock("./conversations-projection", () => ({ publishRemoteConversationsProjection: vi.fn() }));
vi.mock("./device-approvals", () => ({
  approvedDeviceIds: vi.fn(() => new Set<string>()),
  readDeviceApprovals: vi.fn(async () => ({})),
}));

import { logger } from "@/lib/logger";

import { startConnectedProjectionWorker } from "./remote-projection-worker";

const denied = () =>
  new SahelFlowError(
    "License entitlement does not include this capability",
    "LICENSE_FEATURE_DENIED",
    403,
  );

function messages(fn: unknown): string[] {
  return (fn as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
}

async function ticks(count: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(2_000); // the first tick runs 2 s after start
  for (let i = 1; i < count; i += 1) await vi.advanceTimersByTimeAsync(TICK_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  delete (globalThis as Record<symbol, unknown>)[KEY];
  h.entitlement.mockReset();
  h.runtime.mockReset();
});

afterEach(() => {
  const state = (globalThis as Record<symbol, { timer: ReturnType<typeof setTimeout> | null } | undefined>)[KEY];
  if (state?.timer) clearTimeout(state.timer);
  delete (globalThis as Record<symbol, unknown>)[KEY];
  vi.useRealTimers();
});

describe("connected projection worker: resting states are quiet", () => {
  it("an install without the connected capability logs 'idle' once and never warns or errors", async () => {
    h.entitlement.mockRejectedValue(denied());
    startConnectedProjectionWorker();

    await ticks(6);

    expect(messages(logger.warn)).toEqual([]);
    expect(messages(logger.error)).toEqual([]);
    expect(messages(logger.info).filter((m) => m === "connected.projection_worker.idle")).toHaveLength(1);
    expect(h.entitlement).toHaveBeenCalledTimes(6);
  });

  it("says 'resumed' once when the capability comes back, and goes quiet-idle again if it leaves", async () => {
    h.entitlement.mockRejectedValueOnce(denied()).mockResolvedValueOnce({}).mockRejectedValue(denied());
    h.runtime.mockResolvedValue(null); // not enrolled: nothing to publish
    startConnectedProjectionWorker();

    await ticks(4);

    const info = messages(logger.info);
    expect(info.filter((m) => m === "connected.projection_worker.idle")).toHaveLength(2);
    expect(info.filter((m) => m === "connected.projection_worker.resumed")).toHaveLength(1);
    expect(messages(logger.warn)).toEqual([]);
    expect(messages(logger.error)).toEqual([]);
  });

  it("a real failure (the relay is down) still warns, then escalates to an error after 3 in a row", async () => {
    h.entitlement.mockResolvedValue({});
    h.runtime.mockRejectedValue(new Error("relay unreachable"));
    startConnectedProjectionWorker();

    await ticks(3);

    expect(messages(logger.warn)).toEqual([
      "connected.projection_worker.tick_failed",
      "connected.projection_worker.tick_failed",
    ]);
    expect(messages(logger.error)).toEqual(["connected.projection_worker.tick_failed_repeatedly"]);
    expect(messages(logger.info)).not.toContain("connected.projection_worker.idle");
  });
});
