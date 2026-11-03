import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RUNTIME_HEALTHY_PROBE_MS,
  createRuntimeHealthMonitor,
  type RuntimeHealthMonitor,
  type RuntimeHealthStatus,
} from "@/lib/runtime/runtime-health";

interface World {
  healthy: boolean;
  online: boolean;
  visible: boolean;
  throws: boolean;
}

function setup(initial: Partial<World> = {}) {
  const world: World = { healthy: true, online: true, visible: true, throws: false, ...initial };
  const probeTimes: number[] = [];
  const onRecovered = vi.fn();
  const probe = vi.fn((): Promise<boolean> => {
    probeTimes.push(Date.now());
    if (world.throws) return Promise.reject(new Error("network down"));
    return Promise.resolve(world.healthy);
  });
  const monitor = createRuntimeHealthMonitor({
    probe,
    isOnline: () => world.online,
    isVisible: () => world.visible,
    onRecovered,
  });
  // Only changes of the visible status, so "the banner flickered" is a plain list.
  const statuses: RuntimeHealthStatus[] = [];
  let lastStatus: RuntimeHealthStatus = "ok";
  monitor.subscribe((state) => {
    if (state.status === lastStatus) return;
    lastStatus = state.status;
    statuses.push(state.status);
  });
  return { world, monitor, probe, probeTimes, onRecovered, statuses };
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const status = (monitor: RuntimeHealthMonitor) => monitor.getState().status;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runtime health monitor", () => {
  it("stays quiet while the runtime answers, probing once per interval", async () => {
    const { monitor, probe, statuses } = setup();
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS - 1);
    expect(probe).toHaveBeenCalledTimes(0);
    await tick(1);
    expect(probe).toHaveBeenCalledTimes(1);
    await tick(RUNTIME_HEALTHY_PROBE_MS);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(status(monitor)).toBe("ok");
    expect(statuses).toEqual([]);
    monitor.stop();
  });

  it("one failed probe is a blip: no banner, and a good answer forgets it", async () => {
    const { world, monitor, statuses } = setup();
    monitor.start();
    world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS);
    expect(status(monitor)).toBe("ok");
    expect(monitor.getState().failures).toBe(1);
    world.healthy = true;
    await tick(2_000);
    expect(monitor.getState().failures).toBe(0);
    expect(status(monitor)).toBe("ok");
    expect(statuses).not.toContain("reconnecting");
    monitor.stop();
  });

  it("two failures in a row show 'reconnecting' (browser online, runtime silent)", async () => {
    const { world, monitor, onRecovered } = setup();
    monitor.start();
    world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS);
    await tick(2_000);
    expect(status(monitor)).toBe("reconnecting");
    expect(monitor.getState().failures).toBe(2);
    expect(onRecovered).not.toHaveBeenCalled();
    monitor.stop();
  });

  it("clears itself after two good answers and says so once", async () => {
    const { world, monitor, onRecovered } = setup();
    monitor.start();
    world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("reconnecting");

    world.healthy = true;
    await tick(4_000); // back-off after two failures
    expect(status(monitor)).toBe("reconnecting"); // one good answer is not enough yet
    expect(onRecovered).not.toHaveBeenCalled();
    await tick(2_000);
    expect(status(monitor)).toBe("ok");
    expect(onRecovered).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it("a flapping runtime does not make the shown banner flicker", async () => {
    const { world, monitor, onRecovered, statuses } = setup();
    monitor.start();
    world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("reconnecting");
    statuses.length = 0;

    for (let round = 0; round < 4; round += 1) {
      world.healthy = true;
      await tick(round === 0 ? 4_000 : 2_000);
      world.healthy = false;
      await tick(2_000);
    }
    expect(status(monitor)).toBe("reconnecting");
    expect(statuses).not.toContain("ok");
    expect(onRecovered).not.toHaveBeenCalled();

    world.healthy = true;
    await tick(10_000);
    expect(status(monitor)).toBe("ok");
    expect(onRecovered).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it("alternating bad and good answers while healthy never raise the banner", async () => {
    const { world, monitor, statuses } = setup();
    monitor.start();
    for (let round = 0; round < 5; round += 1) {
      world.healthy = false;
      await tick(RUNTIME_HEALTHY_PROBE_MS);
      world.healthy = true;
      await tick(2_000);
    }
    expect(status(monitor)).toBe("ok");
    expect(statuses).toEqual([]);
    monitor.stop();
  });

  it("an offline browser with a reachable runtime shows nothing", async () => {
    const { monitor, probe } = setup({ online: false, healthy: true });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS * 3);
    expect(probe).toHaveBeenCalled();
    expect(status(monitor)).toBe("ok");
    monitor.stop();
  });

  it("an offline browser with a silent runtime says 'offline', not 'reconnecting'", async () => {
    const { monitor } = setup({ online: false, healthy: false });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("offline");
    monitor.stop();
  });

  it("when the network returns but the runtime is still silent, the wording turns to 'reconnecting'", async () => {
    const { world, monitor } = setup({ online: false, healthy: false });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("offline");
    world.online = true;
    monitor.environmentChanged();
    await tick(0);
    expect(status(monitor)).toBe("reconnecting");
    monitor.stop();
  });

  it("backs off 2 s, 4 s, 6 s... and caps at 10 s while the runtime stays silent", async () => {
    const { monitor, probeTimes } = setup({ healthy: false });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS);
    await tick(2_000 + 4_000 + 6_000 + 8_000 + 10_000 + 10_000);
    const gaps = probeTimes.slice(1).map((time, index) => time - (probeTimes[index] ?? time));
    expect(gaps).toEqual([2_000, 4_000, 6_000, 8_000, 10_000, 10_000]);
    monitor.stop();
  });

  it("a probe that rejects counts as a failure instead of breaking the monitor", async () => {
    const { monitor } = setup({ throws: true });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("reconnecting");
    monitor.stop();
  });

  it("a hidden tab makes no requests; coming back probes at once", async () => {
    const { world, monitor, probe } = setup({ visible: false });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS * 5);
    expect(probe).not.toHaveBeenCalled();
    monitor.environmentChanged(); // still hidden
    await tick(0);
    expect(probe).not.toHaveBeenCalled();
    world.visible = true;
    monitor.environmentChanged();
    await tick(0);
    expect(probe).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it("Retry probes immediately, shows 'retrying' while it runs, and one click makes one request", async () => {
    const { world, monitor, probe } = setup();
    monitor.start();
    world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("reconnecting");
    const before = probe.mock.calls.length;

    world.healthy = true;
    const pending = monitor.retryNow();
    expect(monitor.getState().retrying).toBe(true);
    await pending;
    expect(probe.mock.calls.length).toBe(before + 1);
    expect(monitor.getState().retrying).toBe(false);
    expect(status(monitor)).toBe("reconnecting"); // one answer, not yet steady

    await monitor.retryNow();
    expect(status(monitor)).toBe("ok");
    monitor.stop();
  });

  it("stop() ends all probing", async () => {
    const { monitor, probe } = setup();
    monitor.start();
    monitor.stop();
    await tick(RUNTIME_HEALTHY_PROBE_MS * 3);
    expect(probe).not.toHaveBeenCalled();
    await monitor.retryNow();
    expect(probe).not.toHaveBeenCalled();
  });
});

/**
 * F-0022: the seller can close the notice. Closing means "dismissed for this
 * episode": it stays closed through further failed probes, and comes back only
 * when things get worse (reconnecting -> offline) or after a full recovery
 * followed by a NEW outage. The state lives in the monitor, not in the view.
 */
describe("dismissing the notice for one episode", () => {
  async function reconnectingEpisode() {
    const context = setup();
    context.monitor.start();
    context.world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(context.monitor)).toBe("reconnecting");
    expect(context.monitor.getState().dismissed).toBe(false);
    return context;
  }

  it("dismiss() keeps the status (the problem is real) and marks the notice as dismissed", async () => {
    const { monitor } = await reconnectingEpisode();
    monitor.dismiss();
    expect(monitor.getState().status).toBe("reconnecting");
    expect(monitor.getState().dismissed).toBe(true);
    monitor.stop();
  });

  it("further failed probes of the same episode never bring it back", async () => {
    const { monitor } = await reconnectingEpisode();
    monitor.dismiss();
    const afterDismiss: boolean[] = [];
    monitor.subscribe((state) => afterDismiss.push(state.dismissed));
    await tick(60_000);
    expect(monitor.getState().failures).toBeGreaterThan(2);
    expect(monitor.getState().dismissed).toBe(true);
    expect(afterDismiss).not.toContain(false);
    monitor.stop();
  });

  it("a worse state (reconnecting -> offline) brings it back", async () => {
    const { world, monitor } = await reconnectingEpisode();
    monitor.dismiss();
    world.online = false;
    await tick(12_000);
    expect(status(monitor)).toBe("offline");
    expect(monitor.getState().dismissed).toBe(false);
    monitor.stop();
  });

  it("a better state (offline -> reconnecting) stays dismissed, and so does going offline again", async () => {
    const { world, monitor } = setup({ online: false, healthy: false });
    monitor.start();
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("offline");
    monitor.dismiss();

    world.online = true;
    monitor.environmentChanged();
    await tick(0);
    expect(status(monitor)).toBe("reconnecting");
    expect(monitor.getState().dismissed).toBe(true);

    world.online = false;
    await tick(12_000);
    expect(status(monitor)).toBe("offline");
    expect(monitor.getState().dismissed).toBe(true);
    monitor.stop();
  });

  it("a full recovery clears it, still reloads the pages, and a NEW outage shows the notice again", async () => {
    const { world, monitor, onRecovered } = await reconnectingEpisode();
    monitor.dismiss();

    world.healthy = true;
    await tick(10_000);
    expect(status(monitor)).toBe("ok");
    expect(monitor.getState().dismissed).toBe(false);
    expect(onRecovered).toHaveBeenCalledTimes(1);

    world.healthy = false;
    await tick(RUNTIME_HEALTHY_PROBE_MS + 2_000);
    expect(status(monitor)).toBe("reconnecting");
    expect(monitor.getState().dismissed).toBe(false);
    monitor.stop();
  });

  it("dismiss() while everything works does nothing, and reopen() brings a dismissed notice back", async () => {
    const quiet = setup();
    quiet.monitor.start();
    quiet.monitor.dismiss();
    expect(quiet.monitor.getState().dismissed).toBe(false);
    quiet.monitor.stop();

    const { monitor } = await reconnectingEpisode();
    monitor.dismiss();
    expect(monitor.getState().dismissed).toBe(true);
    monitor.reopen();
    expect(monitor.getState().dismissed).toBe(false);
    expect(status(monitor)).toBe("reconnecting");
    monitor.stop();
  });
});
