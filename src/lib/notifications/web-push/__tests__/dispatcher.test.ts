import { describe, expect, it } from "vitest";

import { createDispatcher } from "../dispatcher";
import { PUSH_KINDS, type PushKind } from "../payload";

const SEC = 1000;
const MIN = 60_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);
const dev = (deviceId: string, kinds: readonly PushKind[] = PUSH_KINDS) => ({ deviceId, kinds });
const one = [dev("a")];
// Local clock for the quiet-hours tests: UTC+1 (Algeria, no daylight saving).
const at = (h: number, m: number, s = 0, day = 0): number => Date.UTC(2026, 9, 31 + day, h - 1, m, s);
const WRAP = { startMinute: 22 * 60, endMinute: 7 * 60, utcOffsetMinutes: 60 };

describe("collapse and debounce", () => {
  it("collapses same-kind events into the latest count and waits 90 s after the last one", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "orders", count: 3, now: T0 });
    d.enqueue({ kind: "orders", count: 5, now: T0 + 10 * SEC });
    expect(d.poll({ now: T0 + 10 * SEC + 89_999, devices: one })).toEqual([]);
    expect(d.poll({ now: T0 + 10 * SEC + 90_000, devices: one })).toEqual([
      { deviceId: "a", kind: "orders", count: 5, digest: false },
    ]);
    expect(d.poll({ now: T0 + 600 * SEC, devices: one })).toEqual([]);
  });

  it("is a trailing debounce: every new event pushes the deadline back", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "whatsapp", count: 1, now: T0 });
    d.enqueue({ kind: "whatsapp", count: 2, now: T0 + 60 * SEC });
    expect(d.poll({ now: T0 + 60 * SEC + 89_999, devices: one })).toEqual([]);
    expect(d.poll({ now: T0 + 60 * SEC + 90_000, devices: one })).toEqual([
      { deviceId: "a", kind: "whatsapp", count: 2, digest: false },
    ]);
  });

  it("never waits longer than 5 minutes from the first event", () => {
    const d = createDispatcher();
    for (let k = 0; k < 5; k += 1) d.enqueue({ kind: "orders", count: k + 1, now: T0 + k * MIN });
    expect(d.poll({ now: T0 + 5 * MIN - 1, devices: one })).toEqual([]);
    expect(d.poll({ now: T0 + 5 * MIN, devices: one })).toEqual([
      { deviceId: "a", kind: "orders", count: 5, digest: false },
    ]);
  });

  it("keeps kinds apart and lists them in the fixed kind order", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "licence", count: 1, now: T0 });
    d.enqueue({ kind: "orders", count: 2, now: T0 });
    expect(d.pendingKinds()).toEqual(["orders", "licence"]);
    expect(d.poll({ now: T0 + 90 * SEC, devices: one }).map((x) => x.kind)).toEqual(["orders", "licence"]);
    expect(d.pendingKinds()).toEqual([]);
  });

  it("treats the catch-up after the PC was off as a normal event with a count", () => {
    const d = createDispatcher({ quiet: WRAP });
    d.enqueue({ kind: "orders", count: 12, now: at(9, 0, 0, 3) });
    expect(d.poll({ now: at(9, 1, 30, 3), devices: one })).toEqual([{ deviceId: "a", kind: "orders", count: 12, digest: false }]);
  });

  it("drops a kind whose count falls back to 0, and refuses bad input", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "orders", count: 4, now: T0 });
    d.enqueue({ kind: "orders", count: 0, now: T0 + SEC });
    expect(d.pendingKinds()).toEqual([]);
    expect(() => d.enqueue({ kind: "sms" as never, count: 1, now: T0 })).toThrow();
    expect(() => d.enqueue({ kind: "orders", count: -1, now: T0 })).toThrow();
    expect(() => d.enqueue({ kind: "orders", count: 1.5, now: T0 })).toThrow();
    expect(() => d.enqueue({ kind: "orders", count: 1, now: Number.NaN })).toThrow();
  });
});

describe("devices", () => {
  it("only serves devices that asked for the kind, and forgets a kind nobody wants", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "orders", count: 2, now: T0 });
    const out = d.poll({ now: T0 + 90 * SEC, devices: [dev("a", ["whatsapp"]), dev("b")] });
    expect(out).toEqual([{ deviceId: "b", kind: "orders", count: 2, digest: false }]);
    d.enqueue({ kind: "held", count: 1, now: T0 + 100 * SEC });
    expect(d.poll({ now: T0 + 200 * SEC, devices: [] })).toEqual([]);
    expect(d.pendingKinds()).toEqual([]);
  });
});

describe("per-device limits", () => {
  it("allows one push per kind per 2 minutes and keeps the held one for later", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "orders", count: 1, now: T0 });
    expect(d.poll({ now: T0 + 90 * SEC, devices: one })).toHaveLength(1);
    d.enqueue({ kind: "orders", count: 2, now: T0 + 91 * SEC });
    expect(d.poll({ now: T0 + 181 * SEC, devices: one })).toEqual([]);
    expect(d.poll({ now: T0 + 90 * SEC + 2 * MIN - 1, devices: one })).toEqual([]);
    expect(d.poll({ now: T0 + 90 * SEC + 2 * MIN, devices: one })).toEqual([
      { deviceId: "a", kind: "orders", count: 2, digest: false },
    ]);
  });

  it("does not let one kind slow another", () => {
    const d = createDispatcher();
    d.enqueue({ kind: "orders", count: 1, now: T0 });
    expect(d.poll({ now: T0 + 90 * SEC, devices: one })).toHaveLength(1);
    d.enqueue({ kind: "whatsapp", count: 1, now: T0 + 91 * SEC });
    expect(d.poll({ now: T0 + 181 * SEC, devices: one })).toHaveLength(1);
  });

  it("allows 20 pushes an hour and holds the 21st until the first one is an hour old", () => {
    const d = createDispatcher();
    const sent: number[] = [];
    for (let i = 0; i <= 20; i += 1) {
      d.enqueue({ kind: "orders", count: i + 1, now: T0 + i * 2 * MIN });
      if (d.poll({ now: T0 + i * 2 * MIN + 90 * SEC, devices: one }).length > 0) sent.push(i);
    }
    expect(sent).toEqual(Array.from({ length: 20 }, (_v, i) => i));
    const firstSentAt = T0 + 90 * SEC;
    expect(d.poll({ now: firstSentAt + HOUR - 1, devices: one })).toEqual([]);
    expect(d.poll({ now: firstSentAt + HOUR, devices: one })).toEqual([
      { deviceId: "a", kind: "orders", count: 21, digest: false },
    ]);
  });
});

describe("global token bucket", () => {
  it("lets 60 pushes out at once, then refills one per minute", () => {
    const d = createDispatcher();
    for (const kind of PUSH_KINDS) d.enqueue({ kind, count: 2, now: T0 });
    const devices = Array.from({ length: 11 }, (_v, i) => dev("d" + (i + 1)));
    const first = d.poll({ now: T0 + 90 * SEC, devices });
    expect(first).toHaveLength(60);
    expect(first[59]).toEqual({ deviceId: "d5", kind: "licence", count: 2, digest: false });
    expect(d.poll({ now: T0 + 90 * SEC + 59_999, devices })).toEqual([]);
    expect(d.poll({ now: T0 + 90 * SEC + 60_000, devices })).toEqual([
      { deviceId: "d6", kind: "licence", count: 2, digest: false },
    ]);
  });
});

describe("quiet hours", () => {
  const deliveredAt = (quiet: Parameters<typeof createDispatcher>[0], due: number): boolean => {
    const d = createDispatcher(quiet);
    d.enqueue({ kind: "orders", count: 1, now: due - 90 * SEC });
    return d.poll({ now: due, devices: one }).length === 1;
  };

  it.each([
    ["one second before the window starts", at(21, 59, 59), true],
    ["the start minute", at(22, 0, 0), false],
    ["before midnight", at(23, 59, 59), false],
    ["midnight", at(0, 0, 0, 1), false],
    ["one second before the window ends", at(6, 59, 59, 1), false],
    ["the end minute", at(7, 0, 0, 1), true],
    ["midday", at(12, 0, 0), true],
  ])("window 22:00-07:00, due at %s", (_label, due, expected) => {
    expect(deliveredAt({ quiet: WRAP }, due)).toBe(expected);
  });

  it.each([
    [at(12, 59, 59), true],
    [at(13, 0, 0), false],
    [at(14, 59, 59), false],
    [at(15, 0, 0), true],
  ])("window 13:00-15:00 (no wrap), due at %#", (due, expected) => {
    expect(deliveredAt({ quiet: { startMinute: 13 * 60, endMinute: 15 * 60, utcOffsetMinutes: 60 } }, due)).toBe(expected);
  });

  it("treats equal start and end as no quiet window, and handles a negative offset", () => {
    expect(deliveredAt({ quiet: { startMinute: 600, endMinute: 600, utcOffsetMinutes: 60 } }, at(10, 0, 0))).toBe(true);
    const west = { startMinute: 20 * 60, endMinute: 23 * 60, utcOffsetMinutes: -300 };
    expect(deliveredAt({ quiet: west }, Date.UTC(2026, 9, 31, 2, 0, 0))).toBe(false);
    expect(deliveredAt({ quiet: west }, Date.UTC(2026, 9, 31, 4, 0, 0))).toBe(true);
    expect(deliveredAt({ quiet: null }, at(23, 0, 0))).toBe(true);
  });

  it("holds everything overnight and releases ONE push per kind, with the latest count, when the window ends", () => {
    const d = createDispatcher({ quiet: WRAP });
    d.enqueue({ kind: "orders", count: 3, now: at(23, 0, 0) });
    d.enqueue({ kind: "orders", count: 4, now: at(1, 0, 0, 1) });
    d.enqueue({ kind: "whatsapp", count: 2, now: at(2, 0, 0, 1) });
    d.enqueue({ kind: "orders", count: 9, now: at(3, 0, 0, 1) });
    expect(d.poll({ now: at(3, 5, 0, 1), devices: one })).toEqual([]);
    expect(d.poll({ now: at(6, 59, 59, 1), devices: one })).toEqual([]);
    expect(d.poll({ now: at(7, 0, 0, 1), devices: one })).toEqual([
      { deviceId: "a", kind: "orders", count: 9, digest: true },
      { deviceId: "a", kind: "whatsapp", count: 2, digest: true },
    ]);
    expect(d.poll({ now: at(7, 1, 0, 1), devices: one })).toEqual([]);
  });
});
