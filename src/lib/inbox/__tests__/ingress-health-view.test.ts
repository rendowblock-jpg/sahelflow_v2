// w211 / S05a-07, S05a-10. The pure rules for "connected but silent". Real code:
// the function. Nothing else is involved. NOT covered: any screen.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  deriveIngressHealthView,
  SILENT_AFTER_MS,
  WAITING_AFTER_SEC,
} from "@/lib/inbox/ingress-health-view";

const NOW = Date.parse("2026-10-31T20:00:00.000Z");
const H = 3_600_000;
const MIN = 60_000;

function block(over: {
  spool?: Record<string, unknown>;
  lost?: Record<string, unknown>;
  spooledAgoMs?: number | null;
  committedAgoMs?: number | null;
} = {}) {
  const at = (ago: number | null | undefined) =>
    ago === null || ago === undefined ? null : new Date(NOW - ago).toISOString();
  return {
    v: 1,
    spool: {
      pending: 0, oldestPendingSec: null, retrying: 0, stuck: 0,
      heldByApp: 0, quarantined: 0, unreadable: 0, lastFailureCode: null,
      ...over.spool,
    },
    lost: { sinceStart: { spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0, ...over.lost } },
    inbound: { lastSpooledAt: at(over.spooledAgoMs), lastCommittedAt: at(over.committedAgoMs) },
  };
}
const view = (status: string | null | undefined, ingress: unknown) =>
  deriveIngressHealthView({ status, ingress, now: NOW });

describe("the thresholds are the Founder's numbers", () => {
  it("6 hours and 10 minutes", () => {
    expect(SILENT_AFTER_MS).toBe(6 * H);
    expect(WAITING_AFTER_SEC).toBe(600);
  });
});

describe("grey note: last customer message (Q4)", () => {
  const cases: Array<[string, string | null | undefined, number | null, number | undefined]> = [
    ["5h59m", "connected", 5 * H + 59 * MIN, undefined],
    ["exactly 6h (not older than 6h)", "connected", 6 * H, undefined],
    ["6h and 1 ms", "connected", 6 * H + 1, 6],
    ["6h01m", "connected", 6 * H + MIN, 6],
    ["7h", "connected", 7 * H, 7],
    ["49h30m", "connected", 49 * H + 30 * MIN, 49],
    ["no time known", "connected", null, undefined],
    ["a time in the future (clock skew)", "connected", -H, undefined],
    ["7h but link disconnected", "disconnected", 7 * H, undefined],
    ["7h but link connecting", "connecting", 7 * H, undefined],
    ["7h but waiting for QR", "qr", 7 * H, undefined],
    ["7h but status unknown (null)", null, 7 * H, undefined],
    ["7h but status missing", undefined, 7 * H, undefined],
  ];
  for (const [label, status, ago, hours] of cases) {
    it(label, () => {
      const note = view(status, block({ spooledAgoMs: ago })).silentNote;
      expect(note).toEqual(hours === undefined ? undefined : { hours });
    });
  }

  it("uses the LATER of the two times, so a recent save hides an old arrival", () => {
    expect(view("connected", block({ spooledAgoMs: 10 * H, committedAgoMs: 2 * H })).silentNote).toBeUndefined();
    expect(view("connected", block({ spooledAgoMs: 2 * H, committedAgoMs: 10 * H })).silentNote).toBeUndefined();
    expect(view("connected", block({ spooledAgoMs: 10 * H, committedAgoMs: 8 * H })).silentNote).toEqual({ hours: 8 });
  });

  it("a time that is not a date is unknown, not an alarm", () => {
    const ingress = { ...block(), inbound: { lastSpooledAt: "not a date", lastCommittedAt: 5 } };
    expect(view("connected", ingress)).toEqual({ allClear: true });
  });
});

describe("amber: messages waiting in the spool (Q6)", () => {
  const cases: Array<[string, string, Record<string, unknown>, "waiting" | "stalled" | undefined]> = [
    ["9m59s: nothing", "connected", { pending: 2, oldestPendingSec: 599 }, undefined],
    ["exactly 10m: nothing", "connected", { pending: 2, oldestPendingSec: 600 }, undefined],
    ["10m01s: waiting", "connected", { pending: 2, oldestPendingSec: 601 }, "waiting"],
    ["nothing pending, old number: nothing", "connected", { pending: 0, oldestPendingSec: 900 }, undefined],
    ["pending but no age: nothing", "connected", { pending: 2, oldestPendingSec: null }, undefined],
    ["a few retries, young: nothing", "connected", { pending: 2, retrying: 2, oldestPendingSec: 60 }, undefined],
    ["waiting is a spool fact: shown while disconnected too", "disconnected", { pending: 2, oldestPendingSec: 700 }, "waiting"],
  ];
  for (const [label, status, spool, amber] of cases) {
    it(label, () => expect(view(status, block({ spool })).amber).toBe(amber));
  }
});

describe("amber: stalled, measured (Q5)", () => {
  it("connected + messages stuck after repeated failures = stalled, even when young", () => {
    expect(view("connected", block({ spool: { pending: 3, stuck: 1, oldestPendingSec: 30 } })).amber).toBe("stalled");
  });
  it("stalled wins over waiting", () => {
    expect(view("connected", block({ spool: { pending: 3, stuck: 2, oldestPendingSec: 900 } })).amber).toBe("stalled");
  });
  it("not connected = no stalled claim (the disconnected notice speaks)", () => {
    for (const status of ["disconnected", "connecting", "qr", null, undefined]) {
      expect(view(status, block({ spool: { pending: 3, stuck: 1, oldestPendingSec: 30 } })).amber).toBeUndefined();
    }
  });
  it("stuck with nothing pending is not a stall", () => {
    expect(view("connected", block({ spool: { pending: 0, stuck: 1 } })).amber).toBeUndefined();
  });
});

describe("red: messages the app could not save (Q1)", () => {
  it("adds failed saves, no paired account, quarantined and unreadable files", () => {
    const ingress = block({
      lost: { spoolFailed: 2, noPairedAccount: 1 },
      spool: { quarantined: 1, unreadable: 1 },
    });
    expect(view("connected", ingress).redUnsaved).toBe(5);
  });
  it("does not count groups and broadcast lists (skipped on purpose)", () => {
    expect(view("connected", block({ lost: { unsupportedChat: 9 } })).redUnsaved).toBeUndefined();
  });
  it("ignores negative, fractional and text counts", () => {
    const bad = block({ lost: { spoolFailed: -3, noPairedAccount: 1.5 }, spool: { quarantined: "4" } });
    expect(view("connected", bad)).toEqual({ allClear: true });
  });
  it("is a fact about the spool: still shown when the link is down", () => {
    expect(view("disconnected", block({ lost: { spoolFailed: 1 } })).redUnsaved).toBe(1);
  });
  it("is never allClear", () => {
    expect(view("connected", block({ lost: { spoolFailed: 1 } })).allClear).toBe(false);
  });
});

describe("older sidecar, no block, nonsense: nothing shown, no crash", () => {
  const junk: unknown[] = [undefined, null, {}, "x", 42, [], { spool: "x", lost: 3, inbound: [] }];
  for (const status of ["connected", "disconnected", null, undefined]) {
    it(`status ${String(status)}`, () => {
      for (const ingress of junk) expect(view(status, ingress)).toEqual({ allClear: true });
    });
  }
});

describe("silence alone is never a problem", () => {
  it("a customer message 100 days ago, connected, empty spool: grey note only", () => {
    const result = view("connected", block({ spooledAgoMs: 2400 * H }));
    expect(result.silentNote).toEqual({ hours: 2400 });
    expect(result.amber).toBeUndefined();
    expect(result.redUnsaved).toBeUndefined();
    expect(result.allClear).toBe(true);
  });
  it("any amber makes allClear false", () => {
    expect(view("connected", block({ spool: { pending: 1, oldestPendingSec: 700 } })).allClear).toBe(false);
  });
});

describe("the module only reads numbers", () => {
  it("has no fetch, connect, reconnect, logout or timer in its source", () => {
    const source = readFileSync(fileURLToPath(new URL("../ingress-health-view.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/fetch\(|connect\(|reconnect|logout|setTimeout|setInterval/);
  });
});
