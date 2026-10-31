/**
 * @vitest-environment happy-dom
 */
// S05a-03 / S05a-10. The status answer becomes notices; a notice that lasts
// under one second is never shown (no flicker). Real code: the hook file.
// Stand-ins: fake timers only. NOT covered: the real sidecar, a browser.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  describeIngressHealth,
  NOTICE_SETTLE_MS,
  useSettledNotices,
  WAITING_MIN_AGE_SEC,
  type IngressNotice,
} from "../use-inbox-ingress-health";

function status(over: { lost?: object; spool?: object } = {}) {
  return {
    status: "connected",
    ingress: {
      spool: { pending: 0, oldestPendingSec: null, stuck: 0, ...over.spool },
      lost: { sinceStart: { spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0, ...over.lost } },
    },
  };
}

describe("describeIngressHealth", () => {
  it("has the pinned thresholds", () => {
    expect(NOTICE_SETTLE_MS).toBe(1_000);
    expect(WAITING_MIN_AGE_SEC).toBe(600);
  });

  it("says nothing when everything is zero, absent or not a record", () => {
    expect(describeIngressHealth(status(), false).notices).toEqual([]);
    expect(describeIngressHealth({ status: "connected" }, false).notices).toEqual([]);
    expect(describeIngressHealth(null, false).notices).toEqual([]);
    expect(describeIngressHealth("x", true).notices).toEqual([]);
  });

  it("adds the two real losses into one 'lost' count and keeps unsupported apart", () => {
    const { notices } = describeIngressHealth(
      status({ lost: { spoolFailed: 2, noPairedAccount: 1, unsupportedChat: 5 } }),
      false,
    );
    expect(notices).toEqual([
      { kind: "lost", count: 3, minutes: null },
      { kind: "unsupported", count: 5, minutes: null },
    ]);
  });

  it("ignores negative, fractional and non-number counts", () => {
    const bad = status({ lost: { spoolFailed: -3, noPairedAccount: 1.5, unsupportedChat: "9" } });
    expect(describeIngressHealth(bad, false).notices).toEqual([]);
  });

  it("a negative count never cancels a real one (the sum above hides it)", () => {
    const mixed = status({ lost: { spoolFailed: -3, noPairedAccount: 5 } });
    expect(describeIngressHealth(mixed, false).notices).toEqual([{ kind: "lost", count: 5, minutes: null }]);
  });

  it("a fractional count alone is not a count", () => {
    const fractional = status({ lost: { noPairedAccount: 1.5 } });
    expect(describeIngressHealth(fractional, false).notices).toEqual([]);
  });

  it("calls a backlog 'waiting' only after 10 minutes (Q6), with whole minutes", () => {
    const at = (oldestPendingSec: number) =>
      describeIngressHealth(status({ spool: { pending: 2, oldestPendingSec } }), false).notices;
    expect(at(59)).toEqual([]);
    expect(at(300)).toEqual([]);
    expect(at(600)).toEqual([]);
    expect(at(601)).toEqual([{ kind: "waiting", count: 2, minutes: 10 }]);
    expect(at(900)).toEqual([{ kind: "waiting", count: 2, minutes: 15 }]);
  });

  it("tells a measured stall (connected, messages stuck) as 'stalled', never while the link is down", () => {
    const spool = { pending: 2, oldestPendingSec: 30, stuck: 1 };
    expect(describeIngressHealth(status({ spool }), false).notices).toEqual([
      { kind: "stalled", count: 2, minutes: null },
    ]);
    expect(describeIngressHealth({ ...status({ spool }), status: "disconnected" }, false).notices).toEqual([]);
    expect(describeIngressHealth(status({ spool: { pending: 0, stuck: 1 } }), false).notices).toEqual([]);
  });

  it("counts failed and unreadable spool files with the messages that could not be saved", () => {
    const failed = status({ lost: { spoolFailed: 1 }, spool: { quarantined: 1, unreadable: 2 } });
    expect(describeIngressHealth(failed, false).notices).toEqual([{ kind: "lost", count: 4, minutes: null }]);
  });

  it("shows 'unreachable' only after the helper has been seen reachable", () => {
    expect(describeIngressHealth({ sidecarReachable: false }, false)).toEqual({
      notices: [],
      reachable: false,
    });
    expect(describeIngressHealth({ sidecarReachable: false }, true)).toEqual({
      notices: [{ kind: "unreachable", count: 0, minutes: null }],
      reachable: false,
    });
    expect(describeIngressHealth(status(), true).reachable).toBe(true);
  });
});

describe("useSettledNotices", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const lost: IngressNotice = { kind: "lost", count: 2, minutes: null };

  it("shows a notice only after it has stood for one second", async () => {
    const view = renderHook(({ raw }) => useSettledNotices(raw), { initialProps: { raw: [lost] } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(999)));
    expect(view.result.current).toEqual([]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(view.result.current).toEqual([lost]);
  });

  it("never shows a notice that is gone before the second is over", async () => {
    const view = renderHook(({ raw }) => useSettledNotices(raw), {
      initialProps: { raw: [lost] as IngressNotice[] },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    view.rerender({ raw: [] });
    await act(async () => void (await vi.advanceTimersByTimeAsync(5_000)));
    expect(view.result.current).toEqual([]);
  });

  it("keeps a shown notice for one more second after it goes, then removes it", async () => {
    const view = renderHook(({ raw }) => useSettledNotices(raw), {
      initialProps: { raw: [lost] as IngressNotice[] },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_000)));
    view.rerender({ raw: [] });
    await act(async () => void (await vi.advanceTimersByTimeAsync(999)));
    expect(view.result.current).toEqual([lost]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(view.result.current).toEqual([]);
  });

  it("updates the number of a shown notice at once", async () => {
    const view = renderHook(({ raw }) => useSettledNotices(raw), {
      initialProps: { raw: [lost] as IngressNotice[] },
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_000)));
    view.rerender({ raw: [{ ...lost, count: 7 }] });
    expect(view.result.current).toEqual([{ ...lost, count: 7 }]);
  });
});
