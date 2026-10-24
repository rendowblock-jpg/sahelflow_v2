import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);

vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => {
    effects.push(effect);
  },
}));

import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { RUNTIME_UI_READY_PATH } from "@/lib/runtime-auth";

type FetchInit = {
  method?: string;
  cache?: string;
  credentials?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

const NAVIGATION = {
  responseStart: 800,
  responseEnd: 9000,
  domContentLoadedEventEnd: 15_100,
  loadEventEnd: 0,
};
const RESOURCES = [
  { name: "http://127.0.0.1:3101/_next/static/chunks/app.js?v=1", initiatorType: "script", transferSize: 2048, decodedBodySize: 8192 },
  { name: "http://127.0.0.1:3101/_next/static/css/site.css", initiatorType: "link", transferSize: 1024, decodedBodySize: 4096 },
];
const EXPECTED_TIMING = {
  responseStartMs: 800,
  responseEndMs: 9000,
  domContentLoadedEventEndMs: 15_100,
  firstContentfulPaintMs: 14_000,
  beaconMs: 1000,
  scriptCount: 1,
  scriptTransferBytes: 2048,
  scriptDecodedBytes: 8192,
  resourceCount: 2,
};

let nowMs = 0;
let cleanup: void | (() => void);
let dataset: Record<string, string>;
let getEntriesByType: ReturnType<typeof vi.fn>;

function install(options: { hostname?: string; performance?: unknown } = {}) {
  dataset = {};
  getEntriesByType = vi.fn((type: string) =>
    type === "navigation"
      ? [NAVIGATION]
      : type === "paint"
        ? [{ name: "first-contentful-paint", startTime: 14_000 }]
        : type === "resource"
          ? RESOURCES
          : [],
  );
  vi.stubGlobal("window", {
    location: { hostname: options.hostname ?? "127.0.0.1" },
    performance: "performance" in options ? options.performance : { now: () => nowMs, getEntriesByType },
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: Parameters<typeof clearTimeout>[0]) => clearTimeout(id),
  });
  vi.stubGlobal("document", { documentElement: { dataset } });
}

function mount() {
  effects.length = 0;
  RuntimeUiReadyBeacon();
  expect(effects).toHaveLength(1);
  cleanup = effects[0]();
}

function sentInit(fetchMock: ReturnType<typeof vi.fn>, call: number): FetchInit {
  return fetchMock.mock.calls[call][1] as FetchInit;
}

beforeEach(() => {
  vi.useFakeTimers();
  nowMs = 1000;
});

afterEach(() => {
  if (typeof cleanup === "function") cleanup();
  cleanup = undefined;
  vi.useRealTimers();
});

describe("RuntimeUiReadyBeacon", () => {
  it("sends the page timings once, with the ready signal and every existing option", async () => {
    install();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await vi.advanceTimersByTimeAsync(0);

    expect(dataset.sfHydrated).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(RUNTIME_UI_READY_PATH);
    const init = sentInit(fetchMock, 0);
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-SahelFlow-UI-Ready": "1", "Content-Type": "application/json" },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({ timing: EXPECTED_TIMING });
    expect(init.body).not.toMatch(/http|chunks|\.js|\.css/);
  });

  it("builds the timings once and resends the same body when the first request fails", async () => {
    install();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await vi.advanceTimersByTimeAsync(0);
    nowMs = 9000;
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = [0, 1, 2].map((call) => sentInit(fetchMock, call).body);
    expect(bodies[0]).toBeDefined();
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
    expect(JSON.parse(bodies[2] as string).timing.beaconMs).toBe(1000);
    expect(getEntriesByType).toHaveBeenCalledTimes(3);
  });

  it("sends the ready signal exactly as before when the performance API throws", async () => {
    install({
      performance: {
        now: () => {
          throw new Error("no clock");
        },
        getEntriesByType: () => {
          throw new Error("no entries");
        },
      },
    });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = sentInit(fetchMock, 0);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-SahelFlow-UI-Ready": "1" });
    expect(init.body).toBeUndefined();
  });

  it("sends the ready signal when the page has no performance object, or one that cannot be read", async () => {
    for (const performance of [undefined, null, {}]) {
      install({ performance });
      const fetchMock = vi.fn(async () => ({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);
      mount();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sentInit(fetchMock, 0).headers).toEqual({ "X-SahelFlow-UI-Ready": "1" });
      expect(sentInit(fetchMock, 0).body).toBeUndefined();
      cleanup?.();
      cleanup = undefined;
    }

    install();
    Object.defineProperty(window, "performance", {
      get() {
        throw new Error("blocked");
      },
    });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentInit(fetchMock, 0).body).toBeUndefined();
  });

  it("keeps retrying after a failed request and stops after the first ok answer", async () => {
    install();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends nothing and collects nothing outside the packaged 127.0.0.1 host", async () => {
    install({ hostname: "localhost" });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(dataset.sfHydrated).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getEntriesByType).not.toHaveBeenCalled();
  });
});
